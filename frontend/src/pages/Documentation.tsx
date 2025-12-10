import React from 'react';
import { Card } from "@heroui/react";

export const Documentation: React.FC = () => {
    return (
        <div className="max-w-4xl mx-auto py-8 text-foreground/90 space-y-12">
            <div className="mb-8 border-b border-default-200 pb-4">
                <h1 className="text-4xl font-bold mb-2">Documentation</h1>
                <p className="text-xl text-default-500">Comprehensive guide to Ask Cloudflare MCP</p>
            </div>

            {/* Architecture Section */}
            <section>
                <h2 className="text-2xl font-bold mb-4">Architecture</h2>
                <Card className="p-6">
                    <p className="mb-4">
                        This system uses a hybrid architecture combining Cloudflare Workers, Queues, Workflows, and Vectorize for <strong>Deep Research</strong> capabilities.
                    </p>
                    <ul className="list-disc pl-5 space-y-2 mt-4">
                        <li><strong>Frontend (React/Vite):</strong> A rich dashboard for managing sessions and visualizing research.</li>
                        <li><strong>API Gateway (Worker):</strong> Handles immediate requests and dispatches long-running tasks.</li>
                        <li><strong>Queue (Research Queue):</strong> Buffers analytical workloads to prevent timeouts.</li>
                        <li><strong>Brain (Workflow):</strong> Orchestrates multi-step reasoning: Brainstorming &rarr; Searching &rarr; Synthesizing.</li>
                        <li><strong>Memory (Vectorize):</strong> Stores and retrieves semantic knowledge from documentation.</li>
                    </ul>
                </Card>
            </section>

            {/* Modes Section */}
            <section>
                <h2 className="text-2xl font-bold mb-4">Deep Research Modes</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="p-4">
                        <h3 className="text-lg font-bold text-blue-400 mb-2">🧪 Feasibility Analysis</h3>
                        <p className="text-sm text-default-400">
                            <strong>Goal:</strong> "Can I build X on Cloudflare?"<br />
                            Analyzes your idea against platform limits, pricing, and capability matrices. Generates a "Go/No-Go" report.
                        </p>
                    </Card>
                    <Card className="p-4">
                        <h3 className="text-lg font-bold text-green-400 mb-2">📚 Docs Enrichment</h3>
                        <p className="text-sm text-default-400">
                            <strong>Goal:</strong> "How do I implement feature Y?"<br />
                            Scans documentation, extracts code snippets, and synthesizes a step-by-step implementation guide.
                        </p>
                    </Card>
                    <Card className="p-4">
                        <h3 className="text-lg font-bold text-red-400 mb-2">🐛 Error Fixer</h3>
                        <p className="text-sm text-default-400">
                            <strong>Goal:</strong> "Why is my Worker failing?"<br />
                            Takes an error log, cross-references it with known issues and API docs, and suggests specific code fixes.
                        </p>
                    </Card>
                    <Card className="p-4">
                        <h3 className="text-lg font-bold text-purple-400 mb-2">🔄 Migration Assistant</h3>
                        <p className="text-sm text-default-400">
                            <strong>Goal:</strong> "Move from Vercel to Workers"<br />
                            Analyzes a repository (via Container), identifies incompatible patterns (e.g., Node.js fs), and proposes Cloudflare equivalents.
                        </p>
                    </Card>
                </div>
            </section>

            {/* API Section */}
            <section>
                <h2 className="text-2xl font-bold mb-4">API Endpoints</h2>
                <p className="text-default-400 mb-4">Direct JSON endpoints for programmatic access.</p>

                <div className="space-y-4">
                    <div className="border border-default-200 rounded-lg p-4 bg-zinc-900">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs font-bold">POST</span>
                            <code className="text-sm font-mono">/api/questions</code>
                        </div>
                        <p className="text-sm mb-2 text-zinc-400">Submit a question for immediate or deep research.</p>
                        <pre className="bg-black p-4 rounded overflow-x-auto text-xs font-mono text-green-400">
                            {`curl -X POST https://your-worker.workers.dev/api/questions \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "How to use Durable Objects?", "mode": "deep" }'`}
                        </pre>
                    </div>

                    <div className="border border-default-200 rounded-lg p-4 bg-zinc-900">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs font-bold">GET</span>
                            <code className="text-sm font-mono">/api/research/:sessionId</code>
                        </div>
                        <p className="text-sm mb-2 text-zinc-400">Poll status of a deep research session.</p>
                    </div>
                </div>
            </section>

            {/* Troubleshooting Section */}
            <section>
                <h2 className="text-2xl font-bold mb-4">Troubleshooting</h2>
                <div className="space-y-2">
                    <details className="group border border-default-200 rounded-lg open:bg-default-50">
                        <summary className="flex cursor-pointer items-center justify-between p-4 font-medium">
                            MCP Connection Timeout
                            <span className="transition group-open:rotate-180">▼</span>
                        </summary>
                        <div className="p-4 pt-0 text-sm text-default-500">
                            If the MCP Health Check fails, it usually means the upstream MCP server (docs.mcp.cloudflare.com) is unreachable or slow. Verify that <code>MCP_API_URL</code> is set correctly in `wrangler.toml`.
                        </div>
                    </details>
                    <details className="group border border-default-200 rounded-lg open:bg-default-50">
                        <summary className="flex cursor-pointer items-center justify-between p-4 font-medium">
                            GitHub Token Invalid
                            <span className="transition group-open:rotate-180">▼</span>
                        </summary>
                        <div className="p-4 pt-0 text-sm text-default-500">
                            For Migration Assistant to work, you must provide a valid <code>GITHUB_TOKEN</code> in `wrangler.toml` or via `wrangler secret put`. The token needs <code>repo</code> scope to read private repositories.
                        </div>
                    </details>
                    <details className="group border border-default-200 rounded-lg open:bg-default-50">
                        <summary className="flex cursor-pointer items-center justify-between p-4 font-medium">
                            Tasks Stuck in Queue
                            <span className="transition group-open:rotate-180">▼</span>
                        </summary>
                        <div className="p-4 pt-0 text-sm text-default-500">
                            If tasks are queued but not processing, ensure the Consumer is properly configured in <code>src/index.ts</code>. Run <code>wrangler tail</code> to see if the Consumer is throwing errors (e.g., binding mismatches).
                        </div>
                    </details>
                </div>
            </section>
        </div>
    );
};
