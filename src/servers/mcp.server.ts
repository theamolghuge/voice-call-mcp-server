import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { TwilioCallService } from '../services/twilio/call.service.js';

export class VoiceCallMcpServer {
    private server: McpServer;
    private twilioCallService: TwilioCallService;
    private twilioCallbackUrl: string;

    constructor(twilioCallService: TwilioCallService, twilioCallbackUrl: string) {
        this.twilioCallbackUrl = twilioCallbackUrl;
        this.twilioCallService = twilioCallService;

        this.server = new McpServer({
            name: 'Voice Call MCP Server',
            version: '1.0.0',
            description: 'MCP server that provides tools for initiating phone calls via Twilio'
        });

        this.registerTools();
        this.registerResources();
        this.registerPrompts();
    }

    private registerTools(): void {
        this.server.tool(
            'trigger-call',
            'Trigger an outbound phone call via Twilio',
            {
                toNumber: z.string().describe('The phone number to call'),
                callContext: z.string().describe('Context for the call')
            },
            async ({ toNumber, callContext }) => {
                try {
                    const callSid = await this.twilioCallService.makeCall(this.twilioCallbackUrl, toNumber, callContext);

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
    }

    private registerResources(): void {
        this.server.resource(
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
    }

    private registerPrompts(): void {
        this.server.prompt(
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
    }

    public async start(): Promise<void> {
        // Make a test call
        await this.twilioCallService.makeCall(this.twilioCallbackUrl, '+37065382118', 'Book a restaurant for 2 people on 2025-04-02 at 18:00');

        // Create and connect the stdio transport
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}
