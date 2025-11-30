import { MCPRequest, MCPResponse, MCPToolCallParams } from "../types";

/**
 * Query the Cloudflare Docs MCP API
 */
export async function queryMCP(
  query: string,
  context?: string,
  mcpApiUrl?: string
): Promise<any> {
  const url = mcpApiUrl || "https://docs.mcp.cloudflare.com/mcp";

  try {
    // Create MCP request
    const payload: MCPToolCallParams = {
      query,
      context,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `MCP API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("MCP query error:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown MCP error",
      query,
    };
  }
}

/**
 * Query MCP with event stream support (for WebSocket)
 */
export async function queryMCPStream(
  query: string,
  context?: string,
  mcpApiUrl?: string
): Promise<ReadableStream> {
  const url = mcpApiUrl || "https://docs.mcp.cloudflare.com/mcp";

  const payload: MCPToolCallParams = {
    query,
    context,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`MCP API error (${response.status})`);
  }

  return response.body!;
}

/**
 * Create a JSON-RPC 2.0 request for MCP
 */
export function createMCPRequest(
  method: string,
  params?: any,
  id?: string | number
): MCPRequest {
  return {
    jsonrpc: "2.0",
    method,
    params,
    id: id || Date.now(),
  };
}

/**
 * Create a JSON-RPC 2.0 response for MCP
 */
export function createMCPResponse(
  result?: any,
  error?: { code: number; message: string; data?: any },
  id?: string | number
): MCPResponse {
  return {
    jsonrpc: "2.0",
    result,
    error,
    id,
  };
}
