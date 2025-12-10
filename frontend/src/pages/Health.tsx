import React, { useEffect, useState } from 'react';
import { Card, Button, Spinner, Chip } from "@heroui/react";
import { fetchWithAuth } from '../utils/api';

// Standard step result
interface HealthStepResult {
    name: string;
    status: 'pending' | 'success' | 'failure';
    message?: string;
    durationMs?: number;
    details?: any;
    analysis?: HealthFailureAnalysis;
}

// Structured AI Analysis
interface HealthFailureAnalysis {
    rootCause: string;
    suggestedFix: string;
    severity: 'low' | 'medium' | 'critical';
    confidence: number;
    providedContext?: {
        stepName: string;
        errorMsg: string;
        details?: any;
    };
    fixPrompt?: string;
}

interface HealthCheckResult {
    success: boolean;
    steps: HealthStepResult[];
    totalDurationMs: number;
    error?: string;
    triggerSource?: string;
    aiAnalysis?: string; // Legacy text
    aiAnalysisJson?: string; // Structured map
    timestamp?: string;
}

export const Health: React.FC = () => {
    const [latestResult, setLatestResult] = useState<HealthCheckResult | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [liveSteps, setLiveSteps] = useState<HealthStepResult[]>([]);

    // Copy handler
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Could add toast here
    };

    // Time formatting helpers
    const formatTimePST = (ts?: string) => {
        if (!ts) return "Never";
        // Append Z if missing to force UTC interpretation for D1 timestamps
        const dateStr = ts.endsWith('Z') ? ts : `${ts}Z`;
        try {
            return new Date(dateStr).toLocaleString("en-US", {
                timeZone: "America/Los_Angeles",
                dateStyle: 'medium',
                timeStyle: 'medium'
            });
        } catch (e) {
            return ts; // Fallback
        }
    };

    const getRelativeTime = (ts?: string) => {
        if (!ts) return "";
        const dateStr = ts.endsWith('Z') ? ts : `${ts}Z`;
        const now = new Date();
        const then = new Date(dateStr);
        const diffMs = now.getTime() - then.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    };

    const fetchLatest = async () => {
        try {
            const res = await fetchWithAuth('/api/health/latest');
            if (res.ok) {
                const data = await res.json();
                console.log("Health API Response:", data); // Debug log

                if (data && (data.status || data.steps_json || data.stepsJson)) {
                    // Handle D1 snake_case -> CamelCase
                    let stepsParsed = [];
                    try {
                        const rawSteps = data.steps_json || data.stepsJson || data.steps;
                        stepsParsed = typeof rawSteps === 'string'
                            ? JSON.parse(rawSteps)
                            : (rawSteps || []);
                    } catch (e) {
                        console.error("Failed to parse steps:", e);
                    }

                    const parsed: HealthCheckResult = {
                        success: data.status === 'success' || data.success === true,
                        steps: stepsParsed,
                        totalDurationMs: data.duration_ms || data.totalDurationMs || 0,
                        error: data.error,
                        triggerSource: data.trigger_source || data.triggerSource,
                        aiAnalysis: data.ai_analysis || data.aiAnalysis,
                        aiAnalysisJson: data.ai_analysis_json || data.aiAnalysisJson,
                        timestamp: data.timestamp
                    };
                    console.log("Parsed Health Result:", parsed); // Debug log
                    setLatestResult(parsed);
                } else {
                    console.warn("Health API returned empty or invalid data structure", data);
                    setLatestResult({ success: false, steps: [], totalDurationMs: 0, error: "Invalid Data received from API" });
                }
            } else {
                console.error("Health API returned error status:", res.status);
                setLatestResult({
                    success: false,
                    steps: [],
                    totalDurationMs: 0,
                    error: res.status === 401 ? "Unauthorized: Missing or Invalid API Key" : `API Error: ${res.status}`
                });
            }
        } catch (err) {
            console.error("Failed to fetch latest health:", err);
            setLatestResult({ success: false, steps: [], totalDurationMs: 0, error: "Network Error: Could not reach API" });
        }
    };

    useEffect(() => {
        fetchLatest();
    }, []);

    const runHealthCheck = async () => {
        if (isRunning) return;
        setIsRunning(true);
        setLiveSteps([]);

        try {
            const response = await fetchWithAuth('/api/health/run?stream=true', {
                method: 'POST'
            });

            if (!response.body) {
                console.error("No response body");
                setIsRunning(false);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value);
                const lines = text.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // Parse log format: [Step] STATUS: Message
                    const match = line.match(/^\[(.*?)\] (pending|success|failure): (.*)$/i);
                    if (match) {
                        const [_, stepName, statusKey, message] = match;
                        const status = statusKey.toLowerCase() as 'pending' | 'success' | 'failure';

                        setLiveSteps(prev => {
                            const existingIdx = prev.findIndex(s => s.name === stepName);
                            if (existingIdx !== -1) {
                                const updated = [...prev];
                                updated[existingIdx] = { ...updated[existingIdx], status, message };
                                return updated;
                            } else {
                                return [...prev, { name: stepName, status, message }];
                            }
                        });
                    }
                }
            }

            // After stream finishes, refresh latest result
            await fetchLatest();
        } catch (e) {
            console.error("Health check error:", e);
        } finally {
            setIsRunning(false);
        }
    };

    const getStepIcon = (status: string) => {
        if (status === 'success') return <span className="text-green-500 text-lg">✅</span>;
        if (status === 'failure') return <span className="text-red-500 text-lg">❌</span>;
        return <Spinner size="sm" />;
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return "danger";
            case 'medium': return "warning";
            default: return "default";
        }
    };

    const displaySteps = isRunning ? liveSteps : (latestResult?.steps || []);

    // Stats Calculation
    const totalSteps = displaySteps.length;
    const passingSteps = displaySteps.filter(s => s.status === 'success').length;
    const failingSteps = displaySteps.filter(s => s.status === 'failure').length;
    const passRate = totalSteps > 0 ? Math.round((passingSteps / totalSteps) * 100) : 0;

    return (
        <div className="space-y-8 max-w-4xl mx-auto py-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <span className="text-primary text-4xl">🏥</span>
                        System Health
                    </h1>
                    <p className="text-default-500">Real-time status of all distributed components.</p>
                </div>
                <Button
                    onPress={runHealthCheck}
                    className="bg-primary text-white"
                >
                    {isRunning ? "Running Diagnostics..." : "Run Health Check"}
                </Button>
            </div>

            {/* Scorecards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4 border border-default-200">
                    <p className="text-sm text-default-500 uppercase font-bold">Total Checks</p>
                    <p className="text-3xl font-mono">{totalSteps}</p>
                </Card>
                <Card className="p-4 border border-green-200 bg-green-50/5">
                    <p className="text-sm text-green-600 uppercase font-bold">Passing</p>
                    <p className="text-3xl font-mono text-green-600">{passingSteps}</p>
                </Card>
                <Card className="p-4 border border-red-200 bg-red-50/5">
                    <p className="text-sm text-red-600 uppercase font-bold">Failing</p>
                    <p className="text-3xl font-mono text-red-600">{failingSteps}</p>
                </Card>
                <Card className="p-4 border border-default-200">
                    <p className="text-sm text-default-500 uppercase font-bold">Pass Rate</p>
                    <p className="text-3xl font-mono">{passRate}%</p>
                </Card>
            </div>

            {/* Main Status & Time */}
            <Card className={`border-l-4 ${latestResult?.success ? 'border-l-green-500' : (failingSteps > 0 ? 'border-l-red-500' : 'border-l-default-300')} p-0`}>
                <div className="flex flex-row items-center justify-between p-6">
                    <div className="flex items-center gap-4">
                        {latestResult?.success ? (
                            <div className="bg-green-500/10 p-3 rounded-full text-2xl">✅</div>
                        ) : (
                            <div className="bg-red-500/10 p-3 rounded-full text-2xl">⚠️</div>
                        )}
                        <div>
                            <h2 className="text-xl font-semibold">
                                {isRunning ? "Running Checks..." : (latestResult ? (latestResult.success ? "All Systems Operational" : (latestResult.error || "Issues Detected")) : "Loading...")}
                            </h2>
                            <div className="flex flex-col gap-1 mt-1">
                                <p className="text-sm text-default-500">
                                    <span className="font-semibold">Last Checked: </span>
                                    {latestResult?.timestamp ? formatTimePST(latestResult.timestamp) : "Never"}
                                </p>
                                {latestResult?.timestamp && (
                                    <p className="text-xs text-default-400">
                                        ({getRelativeTime(latestResult.timestamp)}) • Duration: {latestResult?.totalDurationMs ?? 0}ms
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Component Checks Grid */}
            <div className="grid grid-cols-1 gap-4">
                {
                    displaySteps.map((step) => (
                        <Card key={step.name} className={`border ${step.status === 'failure' ? 'border-red-500/50' : 'border-default-200'}`}>
                            <div className="p-4">
                                <div className="flex flex-row items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        {getStepIcon(step.status)}
                                        <span className="font-medium text-lg">{step.name}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-xs px-2 py-0.5 rounded-full uppercase font-bold inline-block
                                 ${step.status === 'success' ? 'bg-green-500/10 text-green-500' :
                                                step.status === 'failure' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                            {step.status}
                                        </div>
                                        {step.durationMs && (
                                            <span className="text-tiny text-default-400 block mt-1">{step.durationMs}ms</span>
                                        )}
                                    </div>
                                </div>
                                {step.message && (
                                    <div className="py-2 border-t border-default-100">
                                        <p className="text-sm text-default-500">{step.message}</p>
                                    </div>
                                )}

                                {/* Sub-Test Details */}
                                {step.details && Object.keys(step.details).length > 0 && (
                                    <div className="mt-3 py-2 border-t border-default-100">
                                        <h4 className="text-xs font-bold uppercase text-default-400 mb-2">Tests Performed</h4>
                                        <div className="space-y-1.5">
                                            {Object.entries(step.details).map(([key, val]: [string, any]) => {
                                                const status = (typeof val === 'string' ? val : val.status) || 'UNKNOWN';
                                                const isOk = status === 'OK' || status === 'success' || (typeof val === 'string' && val === 'OK');
                                                const isFail = status === 'FAILURE' || status === 'failure';
                                                const latency = typeof val === 'object' ? val.latency : undefined;

                                                let badgeColor = 'bg-default-100 text-default-600'; // Default/Skipped
                                                if (isOk) badgeColor = 'bg-green-500/10 text-green-600';
                                                if (isFail) badgeColor = 'bg-red-500/10 text-red-600';
                                                if (status === 'WARNING') badgeColor = 'bg-yellow-500/10 text-yellow-600';

                                                return (
                                                    <div key={key} className="flex items-center justify-between text-sm">
                                                        <span className="font-mono text-default-600">{key}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs px-1.5 py-0.5 rounded font-bold uppercase ${badgeColor}`}>
                                                                {status}
                                                            </span>
                                                            {latency !== undefined && (
                                                                <span className="text-xs text-default-400">
                                                                    {latency}ms
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* AI Analysis Visualization */}
                                {step.status === 'failure' && step.analysis && (
                                    <div className="mt-4 bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-xl">🤖</span>
                                            <span className="font-bold text-red-400">AI Diagnosis</span>
                                            {step.analysis.severity && (
                                                <Chip size="sm" color={getSeverityColor(step.analysis.severity)} variant="soft">
                                                    {step.analysis.severity.toUpperCase()}
                                                </Chip>
                                            )}
                                            <span className="text-xs text-default-400 ml-auto">
                                                Confidence: {step.analysis.confidence ? Math.round(step.analysis.confidence * 100) : 0}%
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <h4 className="text-xs font-bold uppercase text-default-400 mb-1">Root Cause</h4>
                                                <p className="text-sm text-foreground/90">{step.analysis.rootCause || "Unknown"}</p>
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-bold uppercase text-default-400 mb-1">Suggested Fix</h4>
                                                <p className="text-sm text-foreground/90">{step.analysis.suggestedFix || "None provided"}</p>
                                            </div>
                                        </div>

                                        {step.analysis.fixPrompt && (
                                            <div className="mt-4 pt-4 border-t border-red-500/20">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="text-xs font-bold uppercase text-default-400">Fix Prompt for Agent</h4>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 min-w-16 px-2 text-xs"
                                                        onPress={() => copyToClipboard(step.analysis?.fixPrompt || "")}
                                                    >
                                                        Copy Prompt
                                                    </Button>
                                                </div>
                                                <div className="bg-default-100 p-3 rounded-md border border-default-200">
                                                    <pre className="text-xs text-default-600 whitespace-pre-wrap font-mono">
                                                        {step.analysis.fixPrompt}
                                                    </pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))
                }
            </div >
        </div >
    );
};
