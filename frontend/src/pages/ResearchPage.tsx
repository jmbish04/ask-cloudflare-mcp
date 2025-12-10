import { useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Button } from '@heroui/react';
import { ResearchChat } from '../components/ResearchChat';
import { WorkflowVisualizer } from '../components/WorkflowVisualizer';
import { CodebaseViewer } from '../components/CodebaseViewer';
import { ResearchSession } from '../types';

export const ResearchPage = () => {
    const { sessionId } = useParams<{ sessionId: string }>();
    const [session, setSession] = useState<ResearchSession | null>(null);
    const [activeTab, setActiveTab] = useState<'workflow' | 'code'>('workflow');

    if (!sessionId) {
        return <div>Invalid session ID</div>;
    }

    const handleStatusUpdate = (updatedSession: ResearchSession) => {
        setSession(updatedSession);
        // Auto-switch to Code tab if files are present and we haven't manually switched yet (simple logic: activeTab check)
        if (updatedSession.files && updatedSession.files.length > 0 && activeTab === 'workflow' && updatedSession.status === 'completed') {
            setActiveTab('code');
        }
    };

    return (
        <div className="h-screen flex flex-col bg-zinc-50 dark:bg-black">
            {/* Header */}
            <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 justify-between bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-4">
                    <RouterLink to="/">
                        <Button className="bg-transparent text-zinc-600 hover:text-zinc-900">
                            ← Back
                        </Button>
                    </RouterLink>
                    <h1 className="font-bold text-lg">Research Session <span className="text-zinc-400 font-mono text-sm ml-2">{sessionId.slice(0, 8)}</span></h1>
                </div>
                <div className="flex gap-2">
                    {session?.status === 'completed' && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">Completed</span>
                    )}
                </div>
            </header>

            {/* Main Content - Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Chat & Progress */}
                <div className="w-1/2 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                        <WorkflowVisualizer status={session?.status || 'started'} />
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <ResearchChat sessionId={sessionId} onStatusUpdate={handleStatusUpdate} />
                    </div>
                </div>

                {/* Right Panel: Tabs (Workflow Logic / Code) */}
                <div className="w-1/2 flex flex-col bg-zinc-50 dark:bg-black">
                    <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4">
                        <button
                            onClick={() => setActiveTab('workflow')}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'workflow' ? 'border-blue-500 text-blue-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
                        >
                            Visualizer
                        </button>
                        <button
                            onClick={() => setActiveTab('code')}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'code' ? 'border-blue-500 text-blue-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
                        >
                            Code Generated {session?.files?.length ? `(${session.files.length})` : ''}
                        </button>
                    </div>

                    <div className="flex-1 overflow-hidden p-4">
                        {activeTab === 'workflow' ? (
                            <div className="h-full flex items-center justify-center text-zinc-400">
                                {/* Placeholder for more advanced visualizer or just reusing the status visualization in a larger format */}
                                <div className="text-center">
                                    <p className="text-6xl mb-4">🧠</p>
                                    <p className="text-lg">Research Context</p>
                                    <p className="text-sm">Thinking process and context will appear here.</p>
                                </div>
                            </div>
                        ) : (
                            <CodebaseViewer files={session?.files} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
