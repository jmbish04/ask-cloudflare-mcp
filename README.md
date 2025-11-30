# Ask Cloudflare MCP Worker

A Cloudflare Worker that acts as both an API and MCP (Model Context Protocol) server with GitHub integration. This worker helps you query Cloudflare documentation, analyze responses with AI, and get context-aware answers to your Cloudflare-related questions.

## Features

- 🚀 **Dual Interface**: Works as both a REST API and MCP server
- 🤖 **AI-Powered Analysis**: Uses Cloudflare Worker AI to analyze questions and generate follow-ups
- 📚 **Cloudflare Docs Integration**: Queries official Cloudflare documentation via MCP
- 🔗 **GitHub Integration**: Fetches code context from GitHub repositories
- 🌐 **WebSocket Support**: Real-time communication for streaming responses
- 📖 **OpenAPI 3.1.0**: Fully documented API with Swagger UI
- 🎨 **Beautiful Landing Page**: Interactive documentation served as static assets
- 🔒 **Secure**: Uses GitHub Personal Access Token for readonly repository access

## Architecture

```
┌─────────────────┐
│   Client/User   │
└────────┬────────┘
         │
    ┌────▼─────┐
    │   API    │◄──── REST API (HTTP)
    │    or    │
    │   MCP    │◄──── MCP Server (WebSocket)
    └────┬─────┘
         │
    ┌────▼──────────────────────────┐
    │  Cloudflare Worker (Hono)    │
    │  ┌────────────────────────┐  │
    │  │  Question Processing   │  │
    │  └───┬────────────────┬───┘  │
    │      │                │       │
    │  ┌───▼──────┐    ┌───▼────┐ │
    │  │ Worker AI│    │  MCP   │ │
    │  │          │    │ Client │ │
    │  └──────────┘    └───┬────┘ │
    │                      │       │
    │                  ┌───▼────┐ │
    │                  │ GitHub │ │
    │                  │  API   │ │
    │                  └────────┘ │
    └───────────────────────────────┘
```

## Installation

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers enabled
- GitHub Personal Access Token (readonly)
- Wrangler CLI

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ask-cloudflare-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure secrets**

   Create a `.dev.vars` file for local development:
   ```bash
   GITHUB_TOKEN=your_github_personal_access_token
   ```

   For production, set the secret using Wrangler:
   ```bash
   wrangler secret put GITHUB_TOKEN
   ```

4. **Update wrangler.toml**

   Update the account ID and other settings in `wrangler.toml` if needed.

## Usage

### Local Development

```bash
npm run dev
```

This starts the worker at `http://localhost:8787`

### Deploy to Cloudflare

```bash
npm run deploy
```

### Access the Landing Page

Once deployed (or running locally), visit the root URL to see the interactive documentation landing page:

- **Local**: `http://localhost:8787`
- **Production**: `https://your-worker.workers.dev`

The landing page provides:
- Quick links to API documentation and Swagger UI
- Interactive examples with copy-paste functionality
- Complete API endpoint reference
- WebSocket/MCP usage guide
- Setup instructions

## API Endpoints

### REST API

#### 1. Simple Questions Endpoint

Process an array of simple questions.

**Endpoint:** `POST /api/questions/simple`

**Request Body:**
```json
{
  "questions": [
    "How do I deploy a Hono application to Cloudflare Workers?",
    "What are the best practices for using Workers KV?"
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "original_question": "How do I deploy a Hono application to Cloudflare Workers?",
      "rewritten_question": "What are the steps to deploy a Hono framework application to Cloudflare Workers, including configuration and deployment commands?",
      "mcp_response": { ... },
      "follow_up_questions": ["How do I configure routes?"],
      "follow_up_answers": [ ... ],
      "ai_analysis": "The response provides comprehensive deployment steps..."
    }
  ],
  "total_processed": 2,
  "timestamp": "2024-11-30T12:00:00.000Z"
}
```

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/api/questions/simple \
  -H "Content-Type: application/json" \
  -d @examples/simple-questions.json
```

#### 2. Detailed Questions Endpoint

Process detailed questions with code context from GitHub.

**Endpoint:** `POST /api/questions/detailed`

**Request Body:**
```json
{
  "repo_owner": "example-user",
  "repo_name": "my-react-app",
  "questions": [
    {
      "query": "How do I migrate my React Webpack app to Cloudflare Pages?",
      "cloudflare_bindings_involved": ["env", "pages"],
      "node_libs_involved": ["webpack", "react"],
      "tags": ["migration", "pages"],
      "relevant_code_files": [
        {
          "file_path": "webpack.config.js",
          "start_line": 1,
          "end_line": 50,
          "relation_to_question": "Webpack configuration"
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "original_question": { ... },
      "code_snippets": [
        {
          "file_path": "webpack.config.js",
          "code": "module.exports = { ... }",
          "relation": "Webpack configuration"
        }
      ],
      "rewritten_question": "...",
      "mcp_response": { ... },
      "follow_up_questions": [ ... ],
      "follow_up_answers": [ ... ],
      "ai_analysis": "..."
    }
  ],
  "total_processed": 1,
  "timestamp": "2024-11-30T12:00:00.000Z"
}
```

**Example:**
```bash
curl -X POST https://your-worker.workers.dev/api/questions/detailed \
  -H "Content-Type: application/json" \
  -d @examples/detailed-questions.json
```

#### 3. Health Check

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-11-30T12:00:00.000Z"
}
```

### MCP Server (WebSocket)

Connect to the MCP server via WebSocket at `/ws`.

#### Initialize Session

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "clientInfo": {
      "name": "my-client",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

#### List Available Tools

```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 2
}
```

#### Call Tool

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "query_cloudflare_docs",
    "arguments": {
      "query": "How do I use Durable Objects?",
      "context": "Building a real-time chat application"
    }
  },
  "id": 3
}
```

### WebSocket API (Non-MCP)

You can also use the WebSocket endpoint for simple real-time questions:

```json
{
  "type": "question",
  "data": {
    "query": "How do I deploy a Worker?",
    "context": {
      "bindings": ["env", "kv"],
      "libraries": ["hono"]
    }
  }
}
```

Response:
```json
{
  "type": "answer",
  "data": {
    "original_question": "How do I deploy a Worker?",
    "rewritten_question": "...",
    "mcp_response": { ... }
  },
  "timestamp": "2024-11-30T12:00:00.000Z"
}
```

## Documentation

### OpenAPI Specification

Access the OpenAPI spec at `/openapi.json`

### Swagger UI

Interactive API documentation is available at `/swagger`

## GitHub Integration

The worker uses a GitHub Personal Access Token for readonly access to repositories. This allows it to:

- Fetch file contents
- Extract code snippets
- Search repository code
- Get repository structure

### Creating a GitHub Token

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token (classic)
3. Select scopes: `repo` (for private repos) or `public_repo` (for public repos only)
4. Copy the token and set it as `GITHUB_TOKEN` secret

## Project Structure

```
ask-cloudflare-mcp/
├── src/
│   ├── index.ts              # Main worker entry point
│   ├── types.ts              # TypeScript types and Zod schemas
│   ├── routes/
│   │   ├── api.ts            # REST API routes
│   │   └── websocket.ts      # WebSocket handlers
│   └── utils/
│       ├── mcp-client.ts     # MCP client utilities
│       ├── worker-ai.ts      # Worker AI integration
│       └── github.ts         # GitHub API utilities
├── public/                   # Static assets (served via ASSETS binding)
│   ├── index.html            # Interactive landing page
│   └── swagger.html          # Swagger UI page
├── examples/
│   ├── simple-questions.json
│   └── detailed-questions.json
├── wrangler.toml             # Cloudflare Workers configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub Personal Access Token (readonly) | Yes |
| `MCP_API_URL` | Cloudflare Docs MCP API URL | Yes (default set) |
| `AI` | Worker AI binding | Yes (auto-configured) |
| `ASSETS` | Static assets binding for landing page | Yes (auto-configured) |

## Development

### Running Tests

```bash
npm test
```

### Type Checking

```bash
npm run types
```

### Tailing Logs

```bash
npm run tail
```

## Comparison with Python Script

This worker replicates and enhances the functionality of the provided Python script:

| Feature | Python Script | Cloudflare Worker |
|---------|---------------|-------------------|
| Question Processing | ✅ | ✅ |
| Worker AI Integration | ✅ | ✅ |
| MCP Querying | ✅ | ✅ |
| GitHub Integration | ❌ | ✅ |
| Code Snippet Extraction | ✅ (local files) | ✅ (GitHub API) |
| Follow-up Questions | ❌ | ✅ |
| WebSocket Support | ❌ | ✅ |
| OpenAPI Spec | ❌ | ✅ |
| MCP Server | ❌ | ✅ |
| Deployment | Local script | Global edge network |

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions:
- Open an issue on GitHub
- Check the Cloudflare Workers documentation
- Review the MCP protocol specification

## Acknowledgments

- Built with [Hono](https://hono.dev/)
- Uses [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- Integrates with [Cloudflare Docs MCP](https://docs.mcp.cloudflare.com/)
- GitHub integration via [GitHub REST API](https://docs.github.com/en/rest)
