import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { makeCall } from '../services/twilio.service.js';


export async function startMcpServer(twilioCallbackUrl: string): Promise<void> {
    makeCall(twilioCallbackUrl, '+16466339140', 'Hello, how are you?');
    const server = new McpServer({
        name: 'Voice Call MCP Server',
        version: '1.0.0',
        description: 'MCP server that provides tools for initiating phone calls via Twilio'
    });

    server.tool(
        'trigger-call',
        'Trigger an outbound phone call via Twilio',
        {
            toNumber: z.string().describe('The phone number to call'),
            callContext: z.string().describe('Context for the call')
        },
        async ({ toNumber, callContext }) => {
            try {
                const callSid = await makeCall(twilioCallbackUrl, toNumber, callContext);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'success',
                            message: 'Call triggered successfully',
                            callSid: callSid
                        })
                    }]
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            status: 'error',
                            message: `Failed to trigger call: ${errorMessage}`
                        })
                    }],
                    isError: true
                };
            }
        }
    );

    server.resource(
        'get-latest-call',
        new ResourceTemplate('call://transcriptions', { list: undefined }),
        async () => {
            // TODO: get call transcriptions
            try {
                return {
                    contents: [{
                        text: JSON.stringify({
                            transcription: 'aa',
                            status: 'completed',
                        }),
                        uri: 'call://transcriptions/latest',
                        mimeType: 'application/json'
                    }]
                };
            } catch (error) {
                console.error(`Error getting latest call: ${error}`);
                throw error;
            }
        }
    );

    server.prompt(
        'make-restaurant-reservation',
        'Create a prompt for making a restaurant reservation by phone',
        {
            restaurantNumber: z.string().describe('The phone number of the restaurant'),
            peopleNumber: z.string().describe('The number of people in the party'),
            date: z.string().describe('Date of the reservation'),
            time: z.string().describe('Preferred time for the reservation')
        },
        ({ restaurantNumber, peopleNumber, date, time }) => {
            return {
                messages: [{
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `You are calling a restaurant to book a table for ${peopleNumber} people on ${date} at ${time}. Call the restaurant at ${restaurantNumber} from ${process.env.TWILIO_NUMBER}.`
                    }
                }]
            };
        }
    );

    // Create and connect the stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
