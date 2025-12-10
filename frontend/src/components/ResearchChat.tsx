import { useState, useEffect, useRef } from 'react';
import { Card, Spinner, Button } from "@heroui/react";
import { fetchWithAuth } from '../utils/api';
import ReactMarkdown from 'react-markdown';
import { ResearchSession } from '../types';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ResearchChatProps {
    sessionId: string;
    onStatusUpdate: (session: ResearchSession) => void;
}

export const ResearchChat = ({ sessionId, onStatusUpdate }: ResearchChatProps) => {
    const [session, setSession] = useState<ResearchSession | null>(null);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // ... imports

    useEffect(() => {
        const poll = async () => {
            try {
                const res = await fetchWithAuth(`/api/research/${sessionId}`);
                if (!res.ok) {
                    if (res.status === 404) return;
                    throw new Error(`Error fetching status: ${res.statusText}`);
                }
                const data: ResearchSession = await res.json();
                setSession(data);
                onStatusUpdate(data);

                if (data.status === 'completed' || data.status === 'failed') {
                    return true; // Stop polling
                }
            } catch (e) {
                console.error(e);
                setError(e instanceof Error ? e.message : 'Unknown error');
            }
            return false;
        };

        const interval = setInterval(async () => {
            const stop = await poll();
            if (stop) clearInterval(interval);
        }, 2000);

        poll(); // Initial call

        return () => clearInterval(interval);
    }, [sessionId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [session?.status, session?.details]);

    if (error) {
        return <div className="p-4 bg-red-100 text-red-700 rounded-lg">Error: {error}</div>;
    }

    if (!session) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <Spinner size="lg" />
                <p className="text-default-500">Initializing session...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 h-full overflow-y-auto p-4">
            {/* Status Bubbles */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-start">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">🤖</div>
                    <Card className="p-3 bg-zinc-100 dark:bg-zinc-800 max-w-[80%]">
                        <p>Research initialized.</p>
                    </Card>
                </div>

                {session.status !== 'started' && (
                    <div className="flex gap-2 items-start">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">🤖</div>
                        <Card className="p-3 bg-zinc-100 dark:bg-zinc-800 max-w-[80%]">
                            <p className="font-semibold capitalize text-blue-600 mb-1">{session.status.replace('_', ' ')}</p>
                            <p>{session.details || "Processing..."}</p>
                        </Card>
                    </div>
                )}

                {/* Show subqueries if available */}
                {session.data?.subQueries && (
                    <div className="flex gap-2 items-start">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">🤖</div>
                        <Card className="p-3 bg-zinc-100 dark:bg-zinc-800 max-w-[80%]">
                            <p className="font-semibold mb-2">Researching these topics:</p>
                            <ul className="list-disc list-inside text-sm">
                                {session.data.subQueries.map((q: string, i: number) => (
                                    <li key={i}>{q}</li>
                                ))}
                            </ul>
                        </Card>
                    </div>
                )}

                {/* Completed Report */}
                {session.status === 'completed' && session.report && (
                    <div className="flex gap-2 items-start">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">✅</div>
                        <Card className="p-4 bg-white dark:bg-zinc-900 border border-green-200 dark:border-green-800 w-full prose prose-sm max-w-none dark:prose-invert">
                            <ReactMarkdown
                                components={{
                                    code(props: any) {
                                        const { inline, className, children } = props;
                                        const match = /language-(\w+)/.exec(className || '');
                                        const codeContent = String(children).replace(/\n$/, '');

                                        const handleFix = async () => {
                                            const instruction = prompt("What should assume about this fix? (e.g. 'Fix the binding name')", "Apply the suggested fix from the analysis");
                                            if (!instruction) return;

                                            // Heuristic to get file path from previous context or generic
                                            const filePath = prompt("Target file path?", "src/index.ts");
                                            if (!filePath) return;

                                            try {
                                                const res = await fetchWithAuth('/api/engineer/fix', {
                                                    method: 'POST',
                                                    body: JSON.stringify({
                                                        sessionId,
                                                        repoUrl: "https://github.com/jmbish04/ask-cloudflare-mcp", // Hardcoded for demo/MVP, ideally from context
                                                        filePath,
                                                        instruction,
                                                        currentCode: codeContent
                                                    })
                                                });
                                                if (res.ok) {
                                                    alert("Engineering Agent dispatched! 🚀");
                                                } else {
                                                    alert("Failed to dispatch agent");
                                                }
                                            } catch (e) { console.error(e); alert("Error"); }
                                        };

                                        return !inline && match ? (
                                            <div className="relative group">
                                                <SyntaxHighlighter
                                                    style={vscDarkPlus}
                                                    language={match[1]}
                                                    PreTag="div"
                                                    {...props}
                                                >
                                                    {codeContent}
                                                </SyntaxHighlighter>
                                                <Button
                                                    size="sm"
                                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-white"
                                                    onPress={handleFix}
                                                >
                                                    🛠️ Fix This
                                                </Button>
                                            </div>
                                        ) : (
                                            <code className={className} {...props}>
                                                {children}
                                            </code>
                                        );
                                    },
                                }}
                            >
                                {session.report}
                            </ReactMarkdown>
                        </Card>
                    </div>
                )}
            </div>
            <div ref={bottomRef} />
        </div>
    );
};
