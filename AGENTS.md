# Agent Instructions for Testing, Verification, and Frontend Synchronization

This document provides instructions for AI agents and developers on how to maintain, verify, and extend the system, ensuring both backend logic and frontend interfaces remain synchronized.

## 1. Frontend Synchronization Protocol

**CRITICAL:** When adding, modifying, or removing any backend API endpoint, you MUST update the frontend application to reflect these changes. The frontend is a React Single Page Application (SPA) located in the `frontend/` directory.

### When Adding a New Endpoint:
1.  **Update API Client/Fetch Logic:**
    -   Identify where API calls are made (typically within page components like `frontend/src/pages/AnalysisTools.tsx` or dedicated service files).
    -   Ensure the new endpoint uses the correct base URL (`import.meta.env.VITE_WORKER_URL`).

2.  **Update Analysis Tools (`frontend/src/pages/AnalysisTools.tsx`):**
    -   This is the central hub for testing and using API endpoints interactively.
    -   **Add a new Tool Option:** Update the `Select` component to include your new endpoint (e.g., `<SelectItem key="my-new-tool">...`).
    -   **Add Input Configuration:** Add specific input fields (Text inputs, toggles, etc.) for your tool's parameters in the configuration section.
    -   **Implement Handler Logic:** Update `handleAnalyze` to construct the request body and call your new endpoint.
    -   **Support Streaming:** If your endpoint supports SSE (Server-Sent Events), ensure it uses the existing `StreamViewer` component for rich real-time feedback.

3.  **Update Documentation & Examples:**
    -   **`frontend/src/pages/APIDocs.tsx`:** Ensure the OpenAPI spec (`src/index.ts`) is updated so Swagger UI automatically reflects the change.
    -   **`frontend/src/pages/Examples.tsx`:** Add a `curl` example card for the new endpoint to help users understand how to use it programmatically.

4.  **Update Navigation & Home (`frontend/src/pages/Home.tsx`):**
    -   If the new feature warrants a dedicated page or top-level visibility, add a card to the Home page and a link in the Navbar (`frontend/src/components/Layout.tsx`).

### When Modifying an Existing Endpoint:
-   Check `frontend/src/pages/AnalysisTools.tsx` to ensure the request payload matches the new schema.
-   Verify that the response parsing logic (especially for SSE events) handles any new data fields.

## 2. Automated Health Checks (Cron)

The system is configured to run automated health checks:
- **Nightly:** Runs at midnight (UTC) to verify core connectivity.
- **Weekly:** Runs weekly for a more comprehensive audit (future scope).

Results are stored in the `health_checks` D1 database table.

## 3. Manual Health Check (Web Dashboard)

To view the latest status or trigger a run immediately:
1. Navigate to `https://<your-worker-url>/health.html` (e.g., `http://localhost:8787/health.html` locally).
2. The dashboard shows the latest cron result.
3. Click **Run Health Check Now** to execute a real-time diagnostic via WebSocket.

## 4. API Verification

You can verify the system programmatically using the health API:

```bash
# Get latest result
curl https://<your-worker-url>/api/health/latest

# Trigger manual run
curl -X POST https://<your-worker-url>/api/health/run
```

## 5. Local Development Verification

When developing locally or verifying changes to `mcp-client.ts`, run the local test script:

```bash
# Ensure local worker is running first (npm start)
npx ts-node scripts/test-mcp-local.ts
```

This script performs:
1. A call to the health check endpoint.
2. An end-to-end query to the `simple` questions endpoint to verify AI + MCP integration.

## Troubleshooting MCP Connectivity

If `mcp-client.ts` fails:
1. **Check Endpoint:** Ensure `queryMCP` is using the correct URL (`.../mcp` for JSON-RPC or `.../tools/...` for REST if applicable). Current implementation uses JSON-RPC at `/mcp`.
2. **Check Protocol:** Ensure the request is wrapped in a valid JSON-RPC 2.0 envelope.
3. **Check Tool Name:** The Cloudflare Docs server uses `search_cloudflare_documentation`.
