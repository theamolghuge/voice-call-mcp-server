import { WebSocket } from 'ws';
import { OpenAIConfig } from '../../types.js';
import { SHOW_TIMING_MATH } from '../../config/constants.js';

/**
 * Service for handling OpenAI API interactions
 */
export class OpenAIWsService {
    private webSocket: WebSocket | null = null;
    private readonly config: OpenAIConfig;

    /**
     * Create a new OpenAI service
     * @param config Configuration for the OpenAI API
     */
    constructor(config: OpenAIConfig) {
        this.config = config;
    }

    /**
     * Initialize the WebSocket connection to OpenAI
     * @param onMessage Callback for handling messages from OpenAI
     * @param onOpen Callback for when the connection is opened
     * @param onError Callback for handling errors
     */
    public initialize(
        onMessage: (data: WebSocket.Data) => void,
        onOpen: () => void,
        onError: (error: Error) => void
    ): void {
        this.webSocket = new WebSocket(this.config.websocketUrl, {
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
                'OpenAI-Beta': 'realtime=v1'
            }
        });

        this.webSocket.on('open', onOpen);
        this.webSocket.on('message', onMessage);
        this.webSocket.on('error', onError);
    }

    /**
     * Initialize the session with OpenAI
     * @param callContext The context for the call
     */
    public initializeSession(callContext: string): void {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        const sessionUpdate = {
            type: 'session.update',
            session: {
                turn_detection: { type: 'server_vad' },
                input_audio_format: 'g711_ulaw',
                output_audio_format: 'g711_ulaw',
                voice: this.config.voice,
                instructions: callContext,
                modalities: ['text', 'audio'],
                temperature: this.config.temperature,
                'input_audio_transcription': {
                    'model': 'whisper-1'
                },
            }
        };

        this.webSocket.send(JSON.stringify(sessionUpdate));
    }

    /**
     * Close the WebSocket connection
     */
    public close(): void {
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            this.webSocket.close();
        }
    }

    /**
     * Forward audio data to OpenAI
     * @param audioPayload The audio payload to forward
     */
    public sendAudio(audioPayload: string): void {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        const audioAppend = {
            type: 'input_audio_buffer.append',
            audio: audioPayload
        };

        this.webSocket.send(JSON.stringify(audioAppend));
    }

    /**
     * Truncate the assistant's response
     * @param itemId The ID of the assistant's response
     * @param elapsedTime The time elapsed since the response started
     */
    public truncateAssistantResponse(itemId: string, elapsedTime: number): void {
        if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
            return;
        }

        const truncateEvent = {
            type: 'conversation.item.truncate',
            item_id: itemId,
            content_index: 0,
            audio_end_ms: elapsedTime
        };

        if (SHOW_TIMING_MATH) {
            console.error('Sending truncation event:', JSON.stringify(truncateEvent));
        }

        this.webSocket.send(JSON.stringify(truncateEvent));
    }

    /**
     * Check if the WebSocket is connected
     */
    public isConnected(): boolean {
        return this.webSocket !== null && this.webSocket.readyState === WebSocket.OPEN;
    }
}
