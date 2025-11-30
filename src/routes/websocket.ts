import { Env, WSMessage, MCPRequest, MCPResponse } from "../types";
import { queryMCPStream, createMCPResponse } from "../utils/mcp-client";
import { rewriteQuestionForMCP, streamWorkerAI } from "../utils/worker-ai";

/**
 * Handle WebSocket connections for real-time MCP and API communication
 */
export async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  const upgradeHeader = request.headers.get("Upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  // Accept the WebSocket connection
  server.accept();

  // Handle incoming messages
  server.addEventListener("message", async (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string);

      // Check if this is an MCP JSON-RPC request
      if (data.jsonrpc === "2.0") {
        await handleMCPRequest(server, data as MCPRequest, env);
      } else {
        // Handle as API message
        await handleAPIMessage(server, data as WSMessage, env);
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
      const errorMsg: WSMessage = {
        type: "error",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
        timestamp: new Date().toISOString(),
      };
      server.send(JSON.stringify(errorMsg));
    }
  });

  server.addEventListener("close", () => {
    console.log("WebSocket connection closed");
  });

  server.addEventListener("error", (error) => {
    console.error("WebSocket error:", error);
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

/**
 * Handle MCP JSON-RPC requests
 */
async function handleMCPRequest(
  ws: WebSocket,
  request: MCPRequest,
  env: Env
): Promise<void> {
  try {
    switch (request.method) {
      case "tools/list":
        // List available tools
        const response: MCPResponse = createMCPResponse(
          {
            tools: [
              {
                name: "query_cloudflare_docs",
                description: "Query Cloudflare documentation",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "The question to ask",
                    },
                    context: {
                      type: "string",
                      description: "Additional context for the query",
                    },
                  },
                  required: ["query"],
                },
              },
            ],
          },
          undefined,
          request.id
        );
        ws.send(JSON.stringify(response));
        break;

      case "tools/call":
        // Execute tool call
        if (request.params?.name === "query_cloudflare_docs") {
          const { query, context } = request.params.arguments || {};

          // Send status update
          const statusMsg: WSMessage = {
            type: "status",
            data: { status: "processing", query },
            timestamp: new Date().toISOString(),
          };
          ws.send(JSON.stringify(statusMsg));

          // Rewrite question with AI
          const rewrittenQuestion = await rewriteQuestionForMCP(env.AI, query);

          // Query MCP
          const mcpResponse = await fetch(env.MCP_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({ query: rewrittenQuestion, context }),
          }).then((r) => r.json());

          // Send result
          const resultResponse: MCPResponse = createMCPResponse(
            {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(mcpResponse, null, 2),
                },
              ],
            },
            undefined,
            request.id
          );
          ws.send(JSON.stringify(resultResponse));
        } else {
          const errorResponse: MCPResponse = createMCPResponse(
            undefined,
            {
              code: -32601,
              message: `Unknown tool: ${request.params?.name}`,
            },
            request.id
          );
          ws.send(JSON.stringify(errorResponse));
        }
        break;

      case "initialize":
        // Initialize MCP session
        const initResponse: MCPResponse = createMCPResponse(
          {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "ask-cloudflare-mcp",
              version: "1.0.0",
            },
          },
          undefined,
          request.id
        );
        ws.send(JSON.stringify(initResponse));
        break;

      default:
        const unknownResponse: MCPResponse = createMCPResponse(
          undefined,
          {
            code: -32601,
            message: `Method not found: ${request.method}`,
          },
          request.id
        );
        ws.send(JSON.stringify(unknownResponse));
    }
  } catch (error) {
    console.error("MCP request error:", error);
    const errorResponse: MCPResponse = createMCPResponse(
      undefined,
      {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
      request.id
    );
    ws.send(JSON.stringify(errorResponse));
  }
}

/**
 * Handle API messages (non-MCP)
 */
async function handleAPIMessage(
  ws: WebSocket,
  message: WSMessage,
  env: Env
): Promise<void> {
  try {
    if (message.type === "question") {
      const { query, context } = message.data;

      // Send status
      const statusMsg: WSMessage = {
        type: "status",
        data: { status: "processing" },
        timestamp: new Date().toISOString(),
      };
      ws.send(JSON.stringify(statusMsg));

      // Process question
      const rewrittenQuestion = await rewriteQuestionForMCP(env.AI, query, context);

      // Query MCP
      const mcpResponse = await fetch(env.MCP_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ query: rewrittenQuestion, context: context?.context }),
      }).then((r) => r.json());

      // Send answer
      const answerMsg: WSMessage = {
        type: "answer",
        data: {
          original_question: query,
          rewritten_question: rewrittenQuestion,
          mcp_response: mcpResponse,
        },
        timestamp: new Date().toISOString(),
      };
      ws.send(JSON.stringify(answerMsg));
    } else {
      throw new Error(`Unknown message type: ${message.type}`);
    }
  } catch (error) {
    console.error("API message error:", error);
    const errorMsg: WSMessage = {
      type: "error",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      timestamp: new Date().toISOString(),
    };
    ws.send(JSON.stringify(errorMsg));
  }
}
