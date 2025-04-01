import { WebSocket } from 'ws';
import { CallType, CallState, ConversationMessage } from './src/types.js';
import twilio from 'twilio';
import dotenv from 'dotenv';
import { generateOutboundCallContext } from './src/config/prompts.js';
import { GOODBYE_PHRASES, LOG_EVENT_TYPES, SHOW_TIMING_MATH, VOICE, RECORD_CALLS } from './src/config/constants.js';

dotenv.config();

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const handleCallWithOpenAI = async (ws: WebSocket, req: any, callType: CallType) => {
    // Connection-specific state
    let streamSid: string | null = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem: string | null = null;
    let markQueue: string[] = [];
    let responseStartTimestampTwilio: number | null = null;
    const callState = new CallState(callType);
    let hasSeenMedia = false;
    let hasReceivedFirstTranscript = false;

    const checkForGoodbye = (text: string): boolean => {
        const lowercaseText = text.toLowerCase();
        return GOODBYE_PHRASES.some(phrase => lowercaseText.includes(phrase));
    };

    const endCall = () => {
        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            if (openAiWs.readyState === WebSocket.OPEN) {
                openAiWs.close();
            }
        }, 5000);
    };

    // Initialize OpenAI WebSocket connection
    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview', {
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1'
        }
    });

    const initializeCallState = (params: { fromNumber: string; toNumber: string; callContext?: string }): void => {
        const { fromNumber, toNumber, callContext } = params;
        callState.fromNumber = fromNumber;
        callState.toNumber = toNumber;

        setupConversationContext(callContext);
    };

    const setupConversationContext = (callContext?: string): void => {
        callState.initialMessage = 'Hello!';
        callState.callContext = generateOutboundCallContext(callState, callContext);

        const systemMessage: ConversationMessage = {
            role: 'system',
            content: callState.callContext
        };

        callState.conversationHistory = [systemMessage];

        const initialMessage: ConversationMessage = {
            role: callState.callType === CallType.OUTBOUND ? 'user' : 'assistant',
            content: callState.initialMessage
        };

        console.error('DEBUG:', 'Initial message:', callState.initialMessage);
        console.error('DEBUG:', 'Call context:', callState.callContext);

        callState.conversationHistory.push(initialMessage);
    };

    const initializeSession = () => {
        const sessionUpdate = {
            type: 'session.update',
            session: {
                turn_detection: { type: 'server_vad' },
                input_audio_format: 'g711_ulaw',
                output_audio_format: 'g711_ulaw',
                voice: VOICE,
                instructions: callState.callContext,
                modalities: ['text', 'audio'],
                temperature: 0.6,
                'input_audio_transcription': {
                    'model': 'whisper-1'
                },
            }
        };

        console.error('DEBUG:', 'Sending session update:', JSON.stringify(sessionUpdate));
        openAiWs.send(JSON.stringify(sessionUpdate));
    };


    const handleSpeechStartedEvent = () => {
        if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
            const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
            if (SHOW_TIMING_MATH) {
                console.error('DEBUG:', `Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`);
            }

            console.error('DEBUG:', 'lastAssistantItem:', lastAssistantItem);

            // if (lastAssistantItem) {
            const truncateEvent = {
                type: 'conversation.item.truncate',
                item_id: lastAssistantItem,
                content_index: 0,
                audio_end_ms: elapsedTime
            };
            if (SHOW_TIMING_MATH) {
                console.error('DEBUG:', 'Sending truncation event:', JSON.stringify(truncateEvent));
            }
            openAiWs.send(JSON.stringify(truncateEvent));
            // }

            ws.send(JSON.stringify({
                event: 'clear',
                streamSid: streamSid
            }));

            // Reset state
            markQueue = [];
            lastAssistantItem = null;
            responseStartTimestampTwilio = null;
        }
    };

    const sendMark = () => {
        if (streamSid) {
            const markEvent = {
                event: 'mark',
                streamSid: streamSid,
                mark: { name: 'responsePart' }
            };
            ws.send(JSON.stringify(markEvent));
            markQueue.push('responsePart');
        }
    };

    // Set up OpenAI WebSocket event handlers
    openAiWs.on('open', () => {
        console.error('DEBUG:', 'Connected to the OpenAI Realtime API');
        setTimeout(initializeSession, 100);
    });

    openAiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data.toString());

            if (LOG_EVENT_TYPES.includes(response.type)) {
                console.error('DEBUG:', `Received event: ${response.type}`, response);
            }

            // Handle transcription events and log to conversation history
            if (response.type === 'conversation.item.input_audio_transcription.completed') {
                const transcription = response.transcript;
                if (transcription) {
                    callState.conversationHistory.push({
                        role: 'user',
                        content: transcription
                    });

                    // Check for goodbye phrases in user's speech
                    if (checkForGoodbye(transcription)) {
                        endCall();
                        return;
                    }
                }
            }

            if (response.type === 'response.audio_transcript.done') {
                const transcript = response.transcript;
                if (transcript) {
                    callState.conversationHistory.push({
                        role: 'assistant',
                        content: transcript
                    });

                    setTimeout(() => {
                        console.error('DEBUG:', '!!!!!!!!!!Received first transcript set:', transcript);
                        hasReceivedFirstTranscript = true;
                    }, 3500);
                }
            }

            if (response.type === 'response.audio.delta' && response.delta) {
                const audioDelta = {
                    event: 'media',
                    streamSid: streamSid,
                    media: { payload: response.delta }
                };
                ws.send(JSON.stringify(audioDelta));

                if (!responseStartTimestampTwilio) {
                    responseStartTimestampTwilio = latestMediaTimestamp;
                    if (SHOW_TIMING_MATH) {
                        console.error('DEBUG:', `Setting start timestamp for new response: ${responseStartTimestampTwilio}ms`);
                    }
                }

                if (response.item_id) {
                    lastAssistantItem = response.item_id;
                }

                sendMark();
            }

            if (response.type === 'input_audio_buffer.speech_started') {
                handleSpeechStartedEvent();
            }
        } catch (error) {
            console.error('Error processing OpenAI message:', error, 'Raw message:', data);
        }
    });

    // Set up Twilio WebSocket event handlers
    ws.on('message', async (message: Buffer | string) => {
        try {
            const data = JSON.parse(message.toString());

            switch (data.event) {
            case 'media':
                latestMediaTimestamp = data.media.timestamp;

                if (SHOW_TIMING_MATH) {
                    console.error('DEBUG:', `Received media message with timestamp: ${latestMediaTimestamp}ms`);
                }

                // Handle first media event
                if (!hasSeenMedia) {
                    hasSeenMedia = true;

                    if (RECORD_CALLS) {
                        await twilioClient.calls(callState.callSid)
                            .recordings
                            .create();
                    }
                }

                if (openAiWs.readyState === WebSocket.OPEN) { // && hasReceivedFirstTranscript) {
                    const audioAppend = {
                        type: 'input_audio_buffer.append',
                        audio: data.media.payload
                    };
                    openAiWs.send(JSON.stringify(audioAppend));
                }
                break;

            case 'start':
                streamSid = data.start.streamSid;
                console.error('DEBUG:', 'Incoming stream has started', streamSid);
                responseStartTimestampTwilio = null;
                latestMediaTimestamp = 0;

                initializeCallState(data.start.customParameters);
                callState.callSid = data.start.callSid;
                break;

            case 'mark':
                if (markQueue.length > 0) {
                    markQueue.shift();
                }
                break;

            default:
                console.error('DEBUG:', 'Received non-media event:', data.event);
                break;
            }
        } catch (error) {
            console.error('Error parsing message:', error, 'Message:', message);
        }
    });

    // Handle connection cleanup
    ws.on('close', async () => {
        if (openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.close();
        }

        console.error('DEBUG:', 'Client disconnected');
    });

    openAiWs.on('close', () => {
        console.error('DEBUG:', 'Disconnected from the OpenAI Realtime API');
    });

    openAiWs.on('error', (error) => {
        console.error('Error in the OpenAI WebSocket:', error);
    });
};
