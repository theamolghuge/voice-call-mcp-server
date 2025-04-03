import { WebSocket } from 'ws';
import { GOODBYE_PHRASES } from '../config/constants.js';

export const checkForGoodbye = (text: string): boolean => {
    const lowercaseText = text.toLowerCase();
    return GOODBYE_PHRASES.some(phrase => lowercaseText.includes(phrase));
};

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
