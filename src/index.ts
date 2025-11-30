import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { Env } from "./types";
import apiRoutes from "./routes/api";
import healthRoutes from "./routes/health";
import { handleWebSocket } from "./routes/websocket";
import { handleScheduled } from "./handlers/scheduled";

const app = new OpenAPIHono<{ Bindings: Env }>();

// CORS middleware
app.use("/*", cors());

// API routes
app.route("/api", apiRoutes);
app.route("/api", healthRoutes);

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
app.notFound((c) => {
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
export default {
  fetch: app.fetch,
  scheduled: handleScheduled
};

