import { WebSocket } from 'ws';
import { GOODBYE_PHRASES } from '../config/constants.js';

/**
 * Checks if a text contains any goodbye phrases
 * @param text - The text to check for goodbye phrases
 * @returns true if the text contains a goodbye phrase, false otherwise
 */
export const checkForGoodbye = (text: string): boolean => {
    const lowercaseText = text.toLowerCase();
    return GOODBYE_PHRASES.some(phrase => lowercaseText.includes(phrase));
};

/**
 * Gracefully ends a call by closing WebSocket connections
 * @param ws - The Twilio WebSocket connection
 * @param openAiWs - The OpenAI WebSocket connection
 */
export const endCall = (ws: WebSocket, openAiWs: WebSocket): void => {
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
        if (openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.close();
        }
    }, 5000);
};
