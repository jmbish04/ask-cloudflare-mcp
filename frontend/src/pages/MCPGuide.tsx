import { Card, Separator } from "@heroui/react";
import { getWebSocketUrl } from "../utils/api";

export const MCPGuide = () => {
  // Use the injected environment variable or fallback to window location
  const wsUrlDisplay = getWebSocketUrl('/ws');

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold">WebSocket & MCP Integration</h2>
        <p className="text-default-500">Guide to using real-time features and Model Context Protocol</p>
      </div>

      <Card>
        <Card.Content className="space-y-4 p-6">
          <h3 className="text-xl font-bold">Model Context Protocol (MCP)</h3>
          <p>
            This worker implements the Model Context Protocol, allowing AI agents (like Claude Desktop or Cursor)
            to interact with Cloudflare documentation and analysis tools directly.
          </p>

          <h4 className="font-bold mt-4">Usage in Claude Desktop</h4>
          <p>Add the following configuration to your <code className="bg-default-100 px-1 py-0.5 rounded text-sm font-mono">claude_desktop_config.json</code>:</p>
          <pre className="bg-default-100 p-4 rounded-lg overflow-x-auto text-sm">
            {`{
  "mcpServers": {
    "cloudflare-mcp": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server-cloudflare"]
    }
  }
}`}
          </pre>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="space-y-4 p-6">
          <h3 className="text-xl font-bold">WebSocket API</h3>
          <p>
            The <code className="bg-default-100 px-1 py-0.5 rounded text-sm font-mono">/ws</code> endpoint provides a real-time WebSocket connection for streaming updates.
          </p>

          <Separator className="my-4" />

          <h4 className="font-bold">Connecting</h4>
          <code className="block w-full bg-default-100 p-2 rounded text-sm font-mono">{wsUrlDisplay}</code>

          <h4 className="font-bold mt-4">Message Format</h4>
          <pre className="bg-default-100 p-4 rounded-lg overflow-x-auto text-sm">
            {`// Send a message
{
  "type": "ping"
}

// Receive messages
{
  "type": "log",
  "data": "Processing started..."
}`}
          </pre>
        </Card.Content>
      </Card>
    </div>
  );
};
