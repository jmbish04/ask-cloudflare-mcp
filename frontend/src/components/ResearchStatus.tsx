import { useState, useEffect } from 'react';
import { Card, Spinner } from "@heroui/react";
import { fetchWithAuth } from '../utils/api';
import ReactMarkdown from 'react-markdown';

interface ResearchStatusProps {
    sessionId: string;
}

interface StatusData {
    status: string;
    data?: any;
    report?: string;
    timestamp: string;
}

export const ResearchStatus = ({ sessionId }: ResearchStatusProps) => {
    const [status, setStatus] = useState<StatusData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const poll = async () => {
            try {
                const res = await fetchWithAuth(`/api/research/${sessionId}`);
                if (!res.ok) {
                    if (res.status === 404) return; // Wait for it to appear
                    throw new Error(`Error fetching status: ${res.statusText}`);
                }
                const data = await res.json();
                setStatus(data);

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

    if (error) {
        return <Card className="p-4 bg-red-100 text-red-700">Error: {error}</Card>;
    }

    if (!status) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <Spinner size="lg" />
                <p className="text-default-500">Initializing research session...</p>
            </div>
        );
    }

    const getProgress = (s: string) => {
        switch (s) {
            case 'queued': return 10;
            case 'started': return 20;
            case 'brainstorming': return 40;
            case 'gathering_intel': return 60;
            case 'synthesizing': return 80;
            case 'completed': return 100;
            default: return 5;
        }
    };

    const currentProgress = getProgress(status.status);

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold">Research Status</h2>
                        <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-mono text-sm capitalize">
                            {status.status.replace('_', ' ')}
                        </span>
                    </div>

                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 max-w-md">
                        <div
                            className={`bg-blue-600 h-2.5 rounded-full transition-all duration-500 ${status.status === 'completed' ? 'bg-green-600' : ''}`}
                            style={{ width: `${currentProgress}%` }}
                        ></div>
                    </div>
                    <p className="text-sm text-gray-500 text-right max-w-md">{currentProgress}%</p>

                    {status.status === 'gathering_intel' && status.data?.subQueries && (
                        <div className="mt-4">
                            <h3 className="font-semibold mb-2">Expanding queries:</h3>
                            <ul className="list-disc list-inside text-sm text-default-600">
                                {status.data.subQueries.map((q: string, i: number) => (
                                    <li key={i}>{q}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </Card>

            {status.report && (
                <Card className="p-8 prose prose-slate max-w-none dark:prose-invert">
                    <ReactMarkdown>{status.report}</ReactMarkdown>
                </Card>
            )}
        </div>
    );
};
