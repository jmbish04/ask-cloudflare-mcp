# Ask Cloudflare MCP + Deep Research

An advanced Cloudflare Worker that acts as an intelligent research architect. It combines the **Model Context Protocol (MCP)** with **Cloudflare Workflows**, **Vectorize**, and **Queues** to perform deep, multi-step analysis of repositories, PRDs, and error logs.

## 🚀 Key Capabilities

- **🧠 Deep Research Agent**: Uses Cloudflare Workflows to orchestrate multi-step reasoning (Brainstorm → Search → Synthesize).
- **📚 Semantic Memory**: Stores and retrieves knowledge using **Cloudflare Vectorize** (RAG).
- **⚡ Async Architecture**: Uses **Cloudflare Queues** to buffer requests, ensuring high availability and zero timeouts.
- **🐳 Containerized Analysis**: Spawns ephemeral containers to clone and inspect private GitHub repositories securely.
- **🔌 Dual Interface**:
  - **REST API**: For web clients (React Frontend) and CI/CD pipelines.
  - **MCP Server**: Connects natively with Claude Desktop, Cursor, and other AI IDEs.

## 🏗️ Architecture

```mermaid
graph TD
    Client[Client / Frontend] -->|POST /api/research| API[Worker API]
    API -->|Dispatch Job| Queue[Research Queue]
    
    subgraph "Async Processing"
        Queue -->|Trigger| Workflow[Research Workflow]
        
        Workflow -->|1. Brainstorm| AI_Reasoning[Workers AI (Reasoning)]
        Workflow -->|2. Gather Intel| Tools
        
        subgraph Tools
            MCP_Client[MCP Client] -->|Query| CF_Docs[Cloudflare Docs]
            Vector_Service[Vector Service] -->|Search| Vectorize[Vector DB]
            Container[Repo Analyzer] -->|Clone| GitHub[GitHub API]
        end
        
        Workflow -->|3. Synthesize| AI_Writer[Workers AI (Writing)]
        Workflow -->|4. Persist| DB[(D1 Database)]
    end
    
    Client -->|Poll Status| API
    API -->|Read| DB
````

## 🛠️ Features by Mode

| Mode | Description | Tech Stack |
| :--- | :--- | :--- |
| **Feasibility Auditor** | Analyzes a GitHub repo to determine if it can migrate to Workers. | Container + AST Parsing + AI |
| **PRD Enricher** | Reads a Product Requirement Doc and injects technical implementation details. | Vectorize (RAG) + Workflows |
| **Error Fixer** | Analyzes error logs and stack traces to provide specific code fixes. | MCP (Docs Search) + AI |
| **Librarian** | Ingests URLs and code snippets into the Vector Database for future recall. | Vectorize + Embeddings |

## 📦 Installation & Setup

### Prerequisites

  - Node.js 18+
  - Cloudflare Account (Workers Paid Plan required for Vectorize/Workflows)
  - GitHub Token (Repo scope)

### 1\. Clone & Install

```bash
git clone <repository-url>
cd ask-cloudflare-mcp
npm install
```

### 2\. Infrastructure Setup

Run the following commands to create the necessary Cloudflare resources:

```bash
# Database
wrangler d1 create ask-cloudflare-mcp

# Vector Index
wrangler vectorize create ask-cloudflare-index --preset @cf/baai/bge-large-en-v1.5

# Queues
wrangler queues create research-tasks

# Secrets
wrangler secret put GITHUB_TOKEN
```

### 3\. Local Development

Start the full stack (Frontend + Backend + Database):

```bash
npm run dev
```

*Backend runs on port 8787. Frontend runs on port 5173.*

## 🔌 API Endpoints

### Async Research Jobs

All deep research tasks are asynchronous.

1.  **Submit Job**

      - `POST /api/research`
      - Body: `{ "query": "...", "mode": "feasibility" | "enrichment" | "error_fix", "context": "..." }`
      - Returns: `{ "sessionId": "uuid", "status": "queued" }`

2.  **Poll Status**

      - `GET /api/sessions/:sessionId`
      - Returns: `{ "status": "processing", "steps_completed": ["brainstorm", "search"], "result": null }`

### Standard Tools

  - `POST /api/questions/simple`: Quick Q\&A (Sync)
  - `POST /api/ingest`: Add content to Vector Memory

## 🧩 Project Structure

```
/
├── src/
│   ├── index.ts              # Entry point (API + Queue Consumer)
│   ├── ai/                   # Centralized AI Logic (Worker AI, Gemini)
│   ├── containers/           # Durable Objects (for Container checks)
│   ├── core/                 # Core Utilities (Session, Logging, Health)
│   ├── data/                 # Data Layer (Vectorize, D1)
│   ├── git/                  # Git & GitHub Operations
│   ├── mcp/                  # MCP Client & Tooling
│   ├── routes/               # Hono API Routes
│   └── workflows/            # Cloudflare Workflows ("Deep Research")
├── frontend/                 # React + Vite UI
└── containers/               # Python-based Repo Analyzer
```

## 🤝 Contributing

Please read [AGENTS.md](https://www.google.com/search?q=./AGENTS.md) for strict architectural rules regarding the separation of Backend (Workers) and Frontend (React).

## 📄 License

MIT

