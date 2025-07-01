import dotenv from "dotenv";

// Load environment variables FIRST before any other imports
dotenv.config();

// Detect if we're running in MCP mode by checking if we're receiving piped input
// This happens when Claude Desktop spawns the process and communicates via JSON-RPC
const isMcpMode = !process.stdin.isTTY;

// In MCP mode, redirect console output to stderr to prevent JSON-RPC interference
// stdout must remain clean for JSON-RPC communication
if (isMcpMode) {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };

  // Redirect all console output to stderr in MCP mode
  console.log = (...args) => process.stderr.write(`[LOG] ${args.join(" ")}\n`);
  console.error = (...args) =>
    process.stderr.write(`[ERROR] ${args.join(" ")}\n`);
  console.warn = (...args) =>
    process.stderr.write(`[WARN] ${args.join(" ")}\n`);
  console.info = (...args) =>
    process.stderr.write(`[INFO] ${args.join(" ")}\n`);
  console.debug = (...args) =>
    process.stderr.write(`[DEBUG] ${args.join(" ")}\n`);
}

import ngrok from "@ngrok/ngrok";
import { isPortInUse } from "./utils/execution-utils.js";
import { VoiceCallMcpServer } from "./servers/mcp.server.js";
import { TwilioCallService } from "./services/twilio/call.service.js";
import { VoiceServer } from "./servers/voice.server.js";
import twilio from "twilio";
import { CallSessionManager } from "./handlers/openai.handler.js";
import { VoiceProcessingMode } from "./types.js";
import { ChatServiceFactory } from "./services/chat/chat.factory.js";

// Read environment variables directly to avoid module loading order issues
const VOICE_PROCESSING_MODE =
  (process.env.VOICE_PROCESSING_MODE as VoiceProcessingMode) ||
  VoiceProcessingMode.OPENAI;
const CHAT_API_PROVIDER = process.env.CHAT_API_PROVIDER || "openai";

// Define required environment variables
const REQUIRED_ENV_VARS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "NGROK_AUTHTOKEN",
  "TWILIO_NUMBER",
] as const;

// Define conditional environment variables based on voice processing mode
const OPENAI_REQUIRED_VARS = ["OPENAI_API_KEY"] as const;
const VOSK_COQUI_REQUIRED_VARS = [
  "VOSK_MODEL_PATH",
  "COQUI_TTS_MODEL",
] as const;

// Define conditional environment variables based on chat API provider (for Vosk+Coqui mode)
const OPENAI_CHAT_REQUIRED_VARS = ["OPENAI_CHAT_API_KEY"] as const;
const OPENROUTER_REQUIRED_VARS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
] as const;

/**
 * Validates that all required environment variables are present
 * @returns true if all variables are present, exits process otherwise
 */
function validateEnvironmentVariables(): boolean {
  // Check base required variables
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      console.error(`Error: ${envVar} environment variable is required`);
      process.exit(1);
    }
  }

  // Check voice processing mode specific variables
  console.log(`Voice processing mode: ${VOICE_PROCESSING_MODE}`);

  if (VOICE_PROCESSING_MODE === VoiceProcessingMode.OPENAI) {
    for (const envVar of OPENAI_REQUIRED_VARS) {
      if (!process.env[envVar]) {
        console.error(
          `Error: ${envVar} environment variable is required for OpenAI mode`
        );
        process.exit(1);
      }
    }
  } else if (VOICE_PROCESSING_MODE === VoiceProcessingMode.VOSK_COQUI) {
    // Check base Vosk+Coqui variables
    for (const envVar of VOSK_COQUI_REQUIRED_VARS) {
      if (!process.env[envVar]) {
        console.error(
          `Error: ${envVar} environment variable is required for Vosk+Coqui mode`
        );
        process.exit(1);
      }
    }

    // Check chat provider specific variables
    console.log(`Chat API provider: ${CHAT_API_PROVIDER}`);

    if (!ChatServiceFactory.isProviderSupported(CHAT_API_PROVIDER)) {
      console.error(
        `Error: Invalid CHAT_API_PROVIDER: ${CHAT_API_PROVIDER}. Supported providers: ${ChatServiceFactory.getAvailableProviders().join(
          ", "
        )}`
      );
      process.exit(1);
    }

    if (CHAT_API_PROVIDER === "openai") {
      for (const envVar of OPENAI_CHAT_REQUIRED_VARS) {
        if (!process.env[envVar]) {
          console.error(
            `Error: ${envVar} environment variable is required for OpenAI chat provider`
          );
          process.exit(1);
        }
      }
    } else if (CHAT_API_PROVIDER === "openrouter") {
      for (const envVar of OPENROUTER_REQUIRED_VARS) {
        if (!process.env[envVar]) {
          console.error(
            `Error: ${envVar} environment variable is required for OpenRouter chat provider`
          );
          process.exit(1);
        }
      }
    }
  } else {
    console.error(
      `Error: Invalid VOICE_PROCESSING_MODE: ${VOICE_PROCESSING_MODE}. Must be 'openai' or 'vosk_coqui'`
    );
    process.exit(1);
  }

  return true;
}

/**
 * Sets up the port for the application
 */
function setupPort(): number {
  const PORT = process.env.PORT || "3004";
  process.env.PORT = PORT;
  return parseInt(PORT);
}

/**
 * Establishes ngrok tunnel for external access
 * @param portNumber - The port number to forward
 * @returns The public URL provided by ngrok
 */
async function setupNgrokTunnel(portNumber: number): Promise<string> {
  const listener = await ngrok.forward({
    addr: portNumber,
    authtoken_from_env: true,
  });

  const twilioCallbackUrl = listener.url();
  if (!twilioCallbackUrl) {
    throw new Error("Failed to obtain ngrok URL");
  }

  return twilioCallbackUrl;
}

/**
 * Sets up graceful shutdown handlers
 */
function setupShutdownHandlers(): void {
  process.on("SIGINT", async () => {
    try {
      await ngrok.disconnect();
    } catch (err) {
      console.error("Error killing ngrok:", err);
    }
    process.exit(0);
  });
}

/**
 * Retries starting the server when the port is in use
 * @param portNumber - The port number to check
 */
function scheduleServerRetry(portNumber: number): void {
  console.error(
    `Port ${portNumber} is already in use. Server may already be running.`
  );
  console.error("Will retry in 15 seconds...");

  const RETRY_INTERVAL_MS = 15000;

  const retryInterval = setInterval(async () => {
    const stillInUse = await isPortInUse(portNumber);

    if (!stillInUse) {
      clearInterval(retryInterval);
      main();
    } else {
      console.error(
        `Port ${portNumber} is still in use. Will retry in 15 seconds...`
      );
    }
  }, RETRY_INTERVAL_MS);
}

async function main(): Promise<void> {
  try {
    // Detect if we're running in MCP mode by checking if we're receiving piped input
    const isMcpMode = !process.stdin.isTTY;

    if (isMcpMode) {
      // In MCP mode, only start the MCP server for fast initialization
      console.log("🤖 Starting MCP server in standalone mode...");

      // Basic validation for MCP mode
      const requiredVars = [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_NUMBER",
      ];
      for (const envVar of requiredVars) {
        if (!process.env[envVar]) {
          console.error(`Error: ${envVar} environment variable is required`);
          process.exit(1);
        }
      }

      const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      const twilioCallService = new TwilioCallService(twilioClient);

      // Use a placeholder URL for MCP mode - actual calls will need the full server
      const placeholderUrl = "https://placeholder.ngrok.io";
      const mcpServer = new VoiceCallMcpServer(
        twilioCallService,
        placeholderUrl
      );
      await mcpServer.start();

      console.log("✅ MCP server started in standalone mode");
      return;
    }

    // Full server mode (normal execution)
    console.log("🚀 Starting Voice Call MCP Server...");

    validateEnvironmentVariables();
    console.log("✅ Environment variables validated");

    const portNumber = setupPort();
    console.log(`📡 Port configured: ${portNumber}`);

    console.log("🔗 Initializing Twilio client...");
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log("✅ Twilio client initialized");

    console.log("📞 Creating session manager...");
    const sessionManager = new CallSessionManager(twilioClient);
    const twilioCallService = new TwilioCallService(twilioClient);
    console.log("✅ Session manager created");

    // Check if port is already in use
    console.log(`🔍 Checking if port ${portNumber} is available...`);
    const portInUse = await isPortInUse(portNumber);
    if (portInUse) {
      scheduleServerRetry(portNumber);
      return;
    }
    console.log("✅ Port is available");

    // Establish ngrok connectivity
    console.log("🌐 Setting up ngrok tunnel...");
    const twilioCallbackUrl = await setupNgrokTunnel(portNumber);
    console.log(`✅ Ngrok tunnel established: ${twilioCallbackUrl}`);

    // Start the main HTTP server
    console.log("🖥️ Starting HTTP server...");
    const server = new VoiceServer(twilioCallbackUrl, sessionManager);
    server.start();
    console.log("✅ HTTP server started");

    console.log("🤖 Starting MCP server...");
    const mcpServer = new VoiceCallMcpServer(
      twilioCallService,
      twilioCallbackUrl
    );
    await mcpServer.start();
    console.log("✅ MCP server started");

    // Set up graceful shutdown
    setupShutdownHandlers();

    console.log("🎉 All services started successfully!");
    console.log(`📞 Voice Call MCP Server is ready at: ${twilioCallbackUrl}`);
  } catch (error) {
    console.error("❌ Error starting services:", error);
    process.exit(1);
  }
}

// Start the main function
main();
