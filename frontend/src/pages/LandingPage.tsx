import { Card, Button, Link } from "@heroui/react";
import { useState } from "react";

export const LandingPage = () => {
    const [healthStatus, setHealthStatus] = useState<any>(null);


    const checkHealth = async () => {

        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            setHealthStatus(data);
        } catch (e) {
            setHealthStatus({ status: 'ERROR', error: String(e) });
        } finally {

        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-8">
            <h1 className="text-4xl font-bold">Ask Cloudflare MCP</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
                <Card className="p-6 flex flex-col gap-4">
                    <h2 className="text-xl font-semibold">System Health</h2>
                    <p className="text-default-500">Check the health of the Cloudflare Worker and Agents.</p>
                    <Button
                        onPress={checkHealth}

                    >
                        Check Health
                    </Button>
                    {healthStatus && (
                        <div className="p-4 bg-content2 rounded-lg mt-2 overflow-auto max-h-40">
                            <pre className="text-xs">{JSON.stringify(healthStatus, null, 2)}</pre>
                        </div>
                    )}
                </Card>

                <Card className="p-6 flex flex-col gap-4">
                    <h2 className="text-xl font-semibold">Documentation</h2>
                    <p className="text-default-500">View the OpenAPI specification and API documentation.</p>
                    <div className="flex flex-col gap-2">
                        <Link href="/openapi.json" target="_blank">
                            OpenAPI Spec (JSON)
                        </Link>
                        <p className="text-sm text-default-400">
                            For full interactive documentation, use the MCP Inspector or import the spec into Swagger UI.
                        </p>
                    </div>
                </Card>
            </div>

            <Card className="p-6 max-w-4xl w-full">
                <h2 className="text-xl font-semibold mb-4">About</h2>
                <p className="mb-2">
                    This is an Agentic Cloudflare Worker that exposes an MCP server and various AI agents.
                </p>
                <ul className="list-disc list-inside text-default-500 space-y-1">
                    <li><strong>ChatAgent:</strong> Stream capable agent for general queries.</li>
                    <li><strong>Browser Tool:</strong> Headless browser capabilities via Workers.</li>
                    <li><strong>Git Tool:</strong> GitHub repository analysis and automation.</li>
                </ul>
            </Card>
        </div>
    );
};
