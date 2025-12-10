import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { Env } from "./types";
import apiRoutes from "./routes/api";
import healthRoutes from "./routes/health";
import { handleWebSocket } from "./routes/websocket";
import { handleScheduled } from "./handlers/scheduled";
import { RepoAnalyzerContainerConfig } from "./containers/repo-analyzer-container";
import { ResearchWorkflow } from "./workflows/research-workflow";
import browserRender from "./mcp/tools/browserRenderApi";

const app = new OpenAPIHono<{ Bindings: Env }>();

// CORS middleware
app.use("/*", cors());

// Auth middleware
app.use("/api/*", async (c, next) => {
  const apiKey = c.req.header("x-api-key") || c.req.query("key");
  const validKey = c.env.WORKER_API_KEY;

  // Bypass if no key configured (for safety/dev, though user said they set it)
  // or if key matches
  if (validKey && apiKey !== validKey) {
    return c.json({ error: "Unauthorized: Invalid API Key" }, 401);
  }

  if (validKey && !apiKey) {
    return c.json({ error: "Unauthorized: Missing API Key" }, 401);
  }

  await next();
});

// API routes
app.route("/api", apiRoutes);
app.route("/api/health", healthRoutes);
app.route("/api/health", healthRoutes);
app.route("/api/browser", browserRender);

// Chat Agent Route
app.post("/api/chat", async (c) => {
  const id = c.env.CHAT_AGENT.idFromName("default");
  const stub = c.env.CHAT_AGENT.get(id);
  // Forward the request to the Durable Object
  return stub.fetch(c.req.raw);
});

// Root endpoint - serve static landing page
app.get("/", async (c) => {
  try {
    const asset = await c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url)));
    return asset;
  } catch {
    // Fallback if static assets not available
    return c.json({
      name: "Ask Cloudflare MCP Worker",
      version: "1.0.0",
      description: "Cloudflare Worker that acts as both an API and MCP server with GitHub integration",
      endpoints: {
        api: {
          health: "/api/health",
          simpleQuestions: "/api/questions/simple",
          detailedQuestions: "/api/questions/detailed",
        },
        documentation: {
          openapi: "/openapi.json",
          swagger: "/swagger",
        },
        websocket: "/ws",
      },
      mcp: {
        protocol: "JSON-RPC 2.0",
        websocket: "/ws",
        methods: ["initialize", "tools/list", "tools/call"],
      },
    });
  }
});

// OpenAPI spec endpoint
app.doc("/openapi.json", (c) => ({
  openapi: "3.1.0",
  info: {
    version: "1.0.0",
    title: "Ask Cloudflare MCP API",
    description: `API for querying Cloudflare documentation with AI-powered analysis and GitHub integration.

### AI Models
- **Cloudflare Workers AI (Default)**
  - Reasoning: \`@cf/openai/gpt-oss-120b\`
  - Structuring: \`@cf/meta/llama-3.3-70b-instruct-fp8-fast\`

- **Google Gemini (via AI Gateway)**
  - Model: \`gemini-2.5-flash\``,
  },
  servers: [
    {
      url: c.env.WORKER_URL || "https://ask-cloudflare-mcp.hacolby.workers.dev",
      description: "Production server",
    }
  ],
  tags: [
    {
      name: "Questions",
      description: "Endpoints for processing questions against Cloudflare documentation",
    },
    {
      name: "System",
      description: "System and health check endpoints",
    },
  ],
}));

// Swagger UI - serve static file
app.get("/swagger", async (c) => {
  try {
    const asset = await c.env.ASSETS.fetch(new Request(new URL("/swagger.html", c.req.url)));
    return asset;
  } catch {
    // Fallback inline Swagger UI if static file not available
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Ask Cloudflare MCP API - Swagger UI</title>
          <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
        </head>
        <body>
          <div id="swagger-ui"></div>
          <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
          <script>
            window.onload = function() {
              SwaggerUIBundle({
                url: '/openapi.json',
                dom_id: '#swagger-ui',
                presets: [
                  SwaggerUIBundle.presets.apis,
                  SwaggerUIStandalonePreset
                ],
                layout: "BaseLayout"
              });
            };
          </script>
        </body>
      </html>
    `);
  }
});

// WebSocket endpoint
app.get("/ws", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.json(
      {
        error: "Expected Upgrade: websocket",
        info: "This endpoint supports WebSocket connections for real-time MCP and API communication",
        usage: {
          mcp: "Connect with MCP client and send JSON-RPC 2.0 requests",
          api: 'Send JSON messages with type "question" to get real-time answers',
        },
      },
      426
    );
  }

  return handleWebSocket(c.req.raw, c.env);
});

// 404 handler
app.notFound(async (c) => {
  const url = new URL(c.req.url);

  // If it's an API route, return strict JSON 404
  if (url.pathname.startsWith("/api")) {
    return c.json(
      {
        error: "Not Found",
        message: "The requested endpoint does not exist",
        availableEndpoints: [
          "/",
          "/api/health",
          "/api/questions/simple",
          "/api/questions/detailed",
          "/openapi.json",
          "/swagger",
          "/ws",
        ],
      },
      404
    );
  }

  // Otherwise, assume it's a frontend route and serve index.html
  // allowing React Router to handle the 404 or page rendering
  try {
    const asset = await c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url)));
    return asset;
  } catch (e) {
    return c.text("SPA index.html not found", 404);
  }
});

// Error handler
app.onError((err, c) => {
  console.error("Global error handler:", err);
  return c.json(
    {
      error: "Internal Server Error",
      message: err.message,
    },
    500
  );
});

// Scheduled handler
// Scheduled handler
export default {
  fetch: app.fetch,
  scheduled: handleScheduled,

  // Queue Handler for Deep Research
  async queue(batch: MessageBatch<any>, env: Env) {
    for (const message of batch.messages) {
      try {
        console.log(`Processing queue message ${message.id}`);
        // Assume message body contains { sessionId, query, mode }
        await env.RESEARCH_WORKFLOW.create({
          id: crypto.randomUUID(),
          params: message.body
        });
        message.ack();
      } catch (e) {
        console.error("Queue processing error:", e);
        message.retry();
      }
    }
  }
};

// Export the Workflow class so Cloudflare can find it
export { ResearchWorkflow };
export { EngineerWorkflow } from "./workflows/engineer-workflow";
export { GovernanceWorkflow } from "./workflows/governance-workflow";
export { IngestionWorkflow } from "./workflows/ingestion-workflow";
export { MaintenanceWorkflow } from "./workflows/maintenance-workflow";


// Export container configuration
export { RepoAnalyzerContainerConfig };

// Export Agents
export { BaseAgent } from "./ai/agents/BaseAgent";
export { ChatAgent } from "./ai/agents/ChatAgent";

// Export Sandbox Container
export { Sandbox } from "./containers/sandbox";

