// state.ts - Shared state variables
export enum CallType {
    OUTBOUND = 'OUTBOUND',
}

export interface ConversationMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
}

export class CallState {
    speaking = false;
    callType: CallType = CallType.OUTBOUND;
    streamSid = '';
    callSid = '';
    llmStart = 0;
    firstByte = true;
    sendFirstSentenceInputTime: number | null = null;
    fromNumber = '';
    toNumber = '';
    initialMessage = '';
    callContext = '';
    conversationHistory: ConversationMessage[] = [];

    constructor(callType: CallType = CallType.OUTBOUND) {
        this.callType = callType;
    }
}
