import dotenv from 'dotenv';
import express, { Response, } from 'express';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse.js';
import ExpressWs from 'express-ws';
import { WebSocket } from 'ws';
import { CallType } from '../types.js';
import { handleCallWithOpenAI } from '../handlers/openai.handler.js';
import { DYNAMIC_API_SECRET } from '../config/constants.js';

dotenv.config();

const app = ExpressWs(express()).app;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const PORT: number = parseInt(process.env.PORT || '3004');


// Main Express app that handles incoming calls
export const startApp = async (url: string) => {
    app.post('/call/outgoing', async (req, res: Response) => {
        const apiSecret = req.query.apiSecret?.toString();

        if(req.query.apiSecret?.toString() !== DYNAMIC_API_SECRET) {
            res.status(401).json({ error: 'Unauthorized: Invalid or missing API secret' });
            return;
        }

        const fromNumber = req.body.From;
        const toNumber = req.body.To;
        const callContext = req.query.callContext?.toString();

        const twiml = new VoiceResponse();
        const connect = twiml.connect();

        const stream = connect.stream({
            url: `${url.replace('https://', 'wss://')}/call/connection-outgoing/${apiSecret}`,
        });

        stream.parameter({name: 'fromNumber', value: fromNumber});
        stream.parameter({name: 'toNumber', value: toNumber});
        stream.parameter({name: 'callContext', value: callContext});

        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml.toString());
    });

    app.ws('/call/connection-outgoing/:secret', (ws: WebSocket, req) => {
        console.error('DEBUG:', 'Received request:', req.params.secret);
        if(req.params.secret !== DYNAMIC_API_SECRET) {
            console.error('Unauthorized: Invalid or missing API secret');
            ws.close(1008, 'Unauthorized: Invalid or missing API secret');
            return;
        }

        handleCallWithOpenAI(ws, req, CallType.OUTBOUND);
    });

    app.listen(PORT, () => {
        console.error(`Local: http://localhost:${PORT}`);
        console.error(`Remote: ${url}`);
    });
};
