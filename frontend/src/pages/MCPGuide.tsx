import { Card, CardBody, Code, Divider } from "@heroui/react";

export const MCPGuide = () => {
  // Use the injected environment variable or fallback to window location
  const workerUrl = import.meta.env.VITE_WORKER_URL || window.location.origin;
  const wsUrl = workerUrl.replace(/^http/, 'ws');

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold">WebSocket & MCP Integration</h2>
        <p className="text-default-500">Guide to using real-time features and Model Context Protocol</p>
      </div>

      <Card>
        <CardBody className="space-y-4 p-6">
          <h3 className="text-xl font-bold">Model Context Protocol (MCP)</h3>
          <p>
            This worker implements the Model Context Protocol, allowing AI agents (like Claude Desktop or Cursor) 
            to interact with Cloudflare documentation and analysis tools directly.
          </p>
          
          <h4 className="font-bold mt-4">Usage in Claude Desktop</h4>
          <p>Add the following configuration to your <Code>claude_desktop_config.json</Code>:</p>
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
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4 p-6">
          <h3 className="text-xl font-bold">WebSocket API</h3>
          <p>
            The <Code>/ws</Code> endpoint provides a real-time WebSocket connection for streaming updates.
          </p>
          
          <Divider className="my-4"/>
          
          <h4 className="font-bold">Connecting</h4>
          <Code className="w-full">{`${wsUrl}/ws`}</Code>
          
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
        </CardBody>
      </Card>
    </div>
  );
};
