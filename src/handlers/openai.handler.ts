import { WebSocket } from 'ws';
import twilio from 'twilio';
import dotenv from 'dotenv';
import { CallState, CallType, ConversationMessage } from '../types.js';
import { generateOutboundCallContext } from '../config/prompts.js';
import { GOODBYE_PHRASES, LOG_EVENT_TYPES, SHOW_TIMING_MATH, VOICE, RECORD_CALLS } from '../config/constants.js';
dotenv.config();

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const handleCallWithOpenAI = async (ws: WebSocket, req: any, callType: CallType) => {
    console.log(`New OpenAI call handling started - Type: ${callType}`);

    // Connection-specific state
    let streamSid: string | null = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem: string | null = null;
    let markQueue: string[] = [];
    let responseStartTimestampTwilio: number | null = null;
    const callState = new CallState(callType);
    let hasSeenMedia = false;

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

    const initializeCallState = (params: { fromNumber: string; toNumber: string; userId: string; callContext?: string }): void => {
        const { fromNumber, toNumber, userId, callContext } = params;
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
            role:  'user',
            content: callState.initialMessage
        };

        console.log('Initial message:', callState.initialMessage);
        console.log('Call context:', callState.callContext);

        callState.conversationHistory.push(initialMessage);
    };

    const initializeSession = () => {
        console.log('!!!!!!!Initializing session with call context:', callState.callContext, callState.callType);
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

        console.log('Sending session update:', JSON.stringify(sessionUpdate));
        openAiWs.send(JSON.stringify(sessionUpdate));
    };
    const handleSpeechStartedEvent = () => {
        if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
            const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
            if (SHOW_TIMING_MATH) {
                console.log(`Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`);
            }

            if (lastAssistantItem) {
                const truncateEvent = {
                    type: 'conversation.item.truncate',
                    item_id: lastAssistantItem,
                    content_index: 0,
                    audio_end_ms: elapsedTime
                };
                if (SHOW_TIMING_MATH) {
                    console.log('Sending truncation event:', JSON.stringify(truncateEvent));
                }
                openAiWs.send(JSON.stringify(truncateEvent));
            }

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
        console.log('Connected to the OpenAI Realtime API');
        setTimeout(initializeSession, 100);
    });

    openAiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data.toString());

            if (LOG_EVENT_TYPES.includes(response.type)) {
                console.log(`Received event: ${response.type}`, response);
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
                        console.log(`Setting start timestamp for new response: ${responseStartTimestampTwilio}ms`);
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
                    console.log(`Received media message with timestamp: ${latestMediaTimestamp}ms`);
                }

                // Handle first media event
                if (!hasSeenMedia) {
                    console.log('First media event received');
                    hasSeenMedia = true;
                    if (RECORD_CALLS) {
                        await twilioClient.calls(callState.callSid)
                            .recordings
                            .create();
                        console.log('Recording started');
                    }
                }

                if (openAiWs.readyState === WebSocket.OPEN) {
                    const audioAppend = {
                        type: 'input_audio_buffer.append',
                        audio: data.media.payload
                    };
                    openAiWs.send(JSON.stringify(audioAppend));
                }
                break;

            case 'start':
                streamSid = data.start.streamSid;
                console.log('Incoming stream has started', streamSid);
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
                console.log('Received non-media event:', data.event);
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

        if (callState.callSid) {
            // const recordings = await twilioClient.recordings.list({
            //     callSid: callState.callSid,
            //     limit: 1
            // });
            // const mediaUrl = recordings?.length > 0 ? recordings[0]?.mediaUrl : undefined;

        }

        console.log('Client disconnected');
    });

    openAiWs.on('close', () => {
        console.log('Disconnected from the OpenAI Realtime API');
    });

    openAiWs.on('error', (error) => {
        console.error('Error in the OpenAI WebSocket:', error);
    });
};
