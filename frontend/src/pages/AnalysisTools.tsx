import { useState, useEffect, useRef } from 'react';
import { fetchWithAuth } from "../utils/api";
import {
  Card,
  TextField,
  Input,
  Button,
  Select,
  Separator,
  Spinner,
  Accordion,
  Label,
  Description,
  ListBox,
  Alert,
  Chip
} from "@heroui/react";
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

import { motion, AnimatePresence } from "framer-motion";

const MigrationPlanViewer = ({ plan, pillars }: { plan?: MigrationPlan; pillars: Map<string, MigrationPillar> }) => {
  if (!plan && pillars.size === 0) return null;

  const pillarsList = plan?.pillars || Array.from(pillars.values());

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📋</span>
        <h3 className="text-xl font-bold">Migration Plan</h3>
        {plan?.repo_context && (
          <span className="text-sm text-default-500">
            {plan.repo_context.owner}/{plan.repo_context.repo}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pillarsList.map((pillar) => {
          const pillarState = pillars.get(pillar.id) || pillar;
          const isActive = pillarState.status === 'analyzing';
          const isComplete = pillarState.status === 'completed';
          const isError = pillarState.status === 'error';

          return (
            <Card
              key={pillar.id}
              className={`border-2 transition-all ${isActive ? 'border-primary bg-primary-50 dark:bg-primary-900/20' :
                isComplete ? 'border-success bg-success-50 dark:bg-success-900/20' :
                  isError ? 'border-danger bg-danger-50 dark:bg-danger-900/20' :
                    'border-default-200'
                }`}
            >
              <Card.Header className="flex items-start gap-3 p-4">
                <div className="text-2xl">{pillarState.icon || pillar.icon}</div>
                <div className="flex-1">
                  <h4 className="font-bold text-lg">{pillarState.name || pillar.name}</h4>
                  <p className="text-xs text-default-500 mt-1">
                    {pillarState.description || pillar.description}
                  </p>
                </div>
                {isActive && <Spinner size="sm" />}
                {isComplete && <span className="text-success text-xl">✓</span>}
                {isError && <span className="text-danger text-xl">✗</span>}
              </Card.Header>

              <Card.Content className="p-4 pt-0 space-y-2">
                {pillarState.progress !== undefined && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Progress</span>
                      <span>{pillarState.progress}%</span>
                    </div>
                    <div className="w-full bg-default-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${isComplete ? 'bg-success' :
                          isError ? 'bg-danger' :
                            'bg-primary'
                          }`}
                        style={{ width: `${pillarState.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {pillarState.question_count !== undefined && (
                  <div className="text-xs text-default-500">
                    {pillarState.question_count} question{pillarState.question_count !== 1 ? 's' : ''}
                  </div>
                )}

                {pillarState.findings && pillarState.findings.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-semibold mb-1">Key Findings:</div>
                    <ul className="text-xs text-default-600 dark:text-default-400 space-y-1">
                      {pillarState.findings.slice(0, 3).map((finding, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-success mt-0.5">•</span>
                          <span className="line-clamp-2">{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pillarState.bindings && pillarState.bindings.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {pillarState.bindings.slice(0, 3).map((binding, idx) => (
                      <Chip key={idx} size="sm" variant="secondary" className="text-xs">
                        {binding}
                      </Chip>
                    ))}
                  </div>
                )}
              </Card.Content>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

interface MigrationPillar {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'frontend' | 'backend' | 'storage' | 'compute' | 'networking' | 'security' | 'observability';
  bindings: string[];
  question_count?: number;
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  findings?: string[];
  progress?: number;
}

interface MigrationPlan {
  pillars: MigrationPillar[];
  repo_context?: {
    owner: string;
    repo: string;
  };
}

interface AnalysisEventData {
  original_question?: string | { query?: string };
  mcp_response?: string | Record<string, unknown>;
  ai_analysis?: string;
  sessionId?: string;
  pillar_id?: string;
  pillar_name?: string;
  [key: string]: unknown;
}

interface AnalysisEvent {
  type: 'progress' | 'data' | 'error' | 'complete' | 'plan' | 'pillar_start' | 'pillar_progress' | 'pillar_complete';
  message?: string;
  data?: AnalysisEventData | MigrationPlan;
  timestamp?: string;
  pillar_id?: string;
  pillar_name?: string;
}

const StreamViewer = ({ events, plan, pillars }: {
  events: AnalysisEvent[];
  plan?: MigrationPlan;
  pillars: Map<string, MigrationPillar>;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, pillars]);

  return (
    <div className="h-[600px] w-full overflow-y-auto custom-scrollbar" ref={scrollRef}>
      <div className="space-y-4 p-4">
        {/* Migration Plan */}
        <MigrationPlanViewer plan={plan} pillars={pillars} />

        <AnimatePresence initial={false}>
          {events.map((event, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Progress Logs */}
              {event.type === 'progress' && (
                <Card className="bg-content2 border-default-200 border">
                  <Card.Content className="p-3">
                    <div className="flex items-start gap-3">
                      <Spinner size="sm" className="mt-0.5" />
                      <div className="flex-1">
                        <div className="font-mono text-sm text-default-600 dark:text-default-400">
                          <span className="text-blue-500 font-medium">
                            [{event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '...'}]
                          </span>
                          <span className="ml-2">{event.message}</span>
                        </div>
                      </div>
                    </div>
                  </Card.Content>
                </Card>
              )}

              {/* Errors */}
              {event.type === 'error' && (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Error</Alert.Title>
                    {event.message && <Alert.Description>{event.message}</Alert.Description>}
                  </Alert.Content>
                </Alert>
              )}

              {/* Structured Data Results */}
              {event.type === 'data' && event.data && 'original_question' in event.data && (
                <Card className="bg-content2 dark:bg-content1 border-default-200 border">
                  <Card.Content className="space-y-4 p-4">
                    {/* Header if available */}
                    {event.message && (
                      <div className="flex items-center gap-2 text-success font-bold">
                        <span>✓</span>
                        <span>{event.message}</span>
                      </div>
                    )}

                    {/* Question & Analysis Display */}
                    {event.data.original_question && (
                      <div>
                        <h4 className="font-bold text-lg mb-2">Question</h4>
                        <div className="bg-default-100 p-3 rounded-lg">
                          {typeof event.data.original_question === 'string'
                            ? event.data.original_question
                            : (event.data.original_question as { query?: string }).query || JSON.stringify(event.data.original_question)}
                        </div>
                      </div>
                    )}

                    {/* MCP Response */}
                    {event.data.mcp_response && (
                      <Accordion variant="default">
                        <Accordion.Item key="1" aria-label="MCP Response">
                          <Accordion.Heading>
                            <Accordion.Trigger>Cloudflare Documentation Context</Accordion.Trigger>
                          </Accordion.Heading>
                          <Accordion.Panel>
                            <div className="prose dark:prose-invert max-w-none text-sm">
                              <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                                {typeof event.data.mcp_response === 'string'
                                  ? event.data.mcp_response
                                  : JSON.stringify(event.data.mcp_response, null, 2)}
                              </ReactMarkdown>
                            </div>
                          </Accordion.Panel>
                        </Accordion.Item>
                      </Accordion>
                    )}

                    {/* AI Analysis */}
                    {event.data.ai_analysis && (
                      <div>
                        <h4 className="font-bold text-lg mb-2 mt-4 text-primary">AI Analysis</h4>
                        <div className="prose dark:prose-invert max-w-none">
                          <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                            {event.data.ai_analysis}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </Card.Content>
                </Card>
              )}

              {/* Plan Event */}
              {event.type === 'plan' && event.data && (
                <Card className="bg-primary-50 dark:bg-primary-900/20 border-primary-200 border-2">
                  <Card.Content className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">📋</span>
                      <h4 className="font-bold text-lg">Migration Plan Created</h4>
                    </div>
                    <p className="text-sm text-default-600">
                      Analyzing {(event.data as MigrationPlan).pillars.length} migration pillars
                    </p>
                  </Card.Content>
                </Card>
              )}

              {/* Pillar Start */}
              {event.type === 'pillar_start' && (
                <Card className="bg-primary-50 dark:bg-primary-900/20 border-primary-200 border">
                  <Card.Content className="p-3">
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <span className="font-semibold">{event.pillar_name}</span>
                      <span className="text-sm text-default-500">- {event.message}</span>
                    </div>
                  </Card.Content>
                </Card>
              )}

              {/* Pillar Progress */}
              {event.type === 'pillar_progress' && event.data && (
                <Card className="bg-content2 border-default-200 border">
                  <Card.Content className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{event.pillar_name}</span>
                        <span className="text-xs text-default-500">
                          {event.data && 'progress' in event.data ? (event.data as { progress: number }).progress : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-default-200 rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all"
                          style={{ width: `${event.data && 'progress' in event.data ? (event.data as { progress: number }).progress : 0}%` }}
                        />
                      </div>
                      {event.message && (
                        <p className="text-xs text-default-500">{event.message}</p>
                      )}
                    </div>
                  </Card.Content>
                </Card>
              )}

              {/* Pillar Complete */}
              {event.type === 'pillar_complete' && event.data && (
                <Card className="bg-success-50 dark:bg-success-900/20 border-success-200 border">
                  <Card.Content className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-success text-xl">✓</span>
                      <h4 className="font-bold">{event.pillar_name} - Complete</h4>
                    </div>
                    {event.message && (
                      <p className="text-sm text-default-600 mb-2">{event.message}</p>
                    )}
                    {event.data && 'findings' in event.data && Array.isArray((event.data as { findings: string[] }).findings) && (event.data as { findings: string[] }).findings.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold mb-1">Key Findings:</p>
                        <ul className="text-xs text-default-600 space-y-1">
                          {(event.data as { findings: string[] }).findings.slice(0, 3).map((finding: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-1">
                              <span>•</span>
                              <span>{finding}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card.Content>
                </Card>
              )}

              {/* Completion */}
              {event.type === 'complete' && (
                <Alert status="success">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Analysis Complete!</Alert.Title>
                    {event.data && 'sessionId' in event.data && event.data.sessionId && (
                      <Alert.Description>Session ID: {String(event.data.sessionId)}</Alert.Description>
                    )}
                  </Alert.Content>
                </Alert>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export const AnalysisTools = () => {
  const [selectedTool, setSelectedTool] = useState<string>("simple");
  const [question, setQuestion] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [useGemini, setUseGemini] = useState(false);
  const [events, setEvents] = useState<AnalysisEvent[]>([]);
  const [migrationPlan, setMigrationPlan] = useState<MigrationPlan | undefined>();
  const [pillars, setPillars] = useState<Map<string, MigrationPillar>>(new Map());
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setEvents([]);
    setMigrationPlan(undefined);
    setPillars(new Map());

    try {
      let endpoint = '';
      let body = {};

      if (selectedTool === "simple") {
        endpoint = "/api/questions/simple?stream=true";
        body = { questions: [question], use_gemini: useGemini };
      } else if (selectedTool === "auto-analyze") {
        endpoint = "/api/questions/auto-analyze?stream=true";
        body = { repo_url: repoUrl, use_gemini: useGemini };
      } else if (selectedTool === "pr-analyze") {
        endpoint = "/api/questions/pr-analyze?stream=true";
        body = { pr_url: prUrl, use_gemini: useGemini };
      }

      const response = await fetchWithAuth(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        // SSE events are separated by double newlines (\n\n)
        // Process complete events and keep incomplete ones in buffer
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || ''; // Keep the last (potentially incomplete) part

        for (const part of parts) {
          // Skip empty parts
          if (!part.trim()) continue;

          // Find the data line in this event block
          const lines = part.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6).trim();
                if (!jsonStr) continue;

                const event = JSON.parse(jsonStr);
                // Ensure timestamp is set if missing
                if (!event.timestamp) {
                  event.timestamp = new Date().toISOString();
                }

                // Handle plan event
                if (event.type === 'plan' && event.data) {
                  setMigrationPlan(event.data as MigrationPlan);
                  // Initialize pillars map
                  const pillarsMap = new Map<string, MigrationPillar>();
                  (event.data as MigrationPlan).pillars.forEach(p => {
                    pillarsMap.set(p.id, { ...p, status: 'pending', progress: 0 });
                  });
                  setPillars(pillarsMap);
                }

                // Handle pillar events
                if (event.type === 'pillar_start' && event.pillar_id) {
                  setPillars(prev => {
                    const updated = new Map(prev);
                    const pillar = updated.get(event.pillar_id!) || {
                      id: event.pillar_id!,
                      name: event.pillar_name || '',
                      description: '',
                      icon: '',
                      category: 'compute',
                      bindings: [],
                      status: 'analyzing',
                      progress: 0
                    };
                    updated.set(event.pillar_id!, { ...pillar, status: 'analyzing', progress: 0 });
                    return updated;
                  });
                }

                if (event.type === 'pillar_progress' && event.pillar_id && event.data) {
                  setPillars(prev => {
                    const updated = new Map(prev);
                    const pillar = updated.get(event.pillar_id!);
                    const progressData = event.data as { progress?: number };
                    if (pillar) {
                      updated.set(event.pillar_id!, {
                        ...pillar,
                        status: 'analyzing',
                        progress: progressData.progress || 0
                      });
                    }
                    return updated;
                  });
                }

                if (event.type === 'pillar_complete' && event.pillar_id && event.data) {
                  setPillars(prev => {
                    const updated = new Map(prev);
                    const pillar = updated.get(event.pillar_id!);
                    const completeData = event.data as { findings?: string[] };
                    if (pillar) {
                      updated.set(event.pillar_id!, {
                        ...pillar,
                        status: 'completed',
                        progress: 100,
                        findings: completeData.findings || []
                      });
                    }
                    return updated;
                  });
                }

                // Add event to state - this will trigger a re-render
                setEvents(prev => [...prev, event]);

                // Log progress events for debugging
                if (event.type === 'progress') {
                  console.log('[Progress]', event.message);
                }
              } catch (e) {
                console.warn(`Failed to parse SSE event:`, e, `Raw line:`, line);
              }
              break; // Only process first data line per event block
            }
          }
        }
      }

      // Process any remaining buffer content after stream ends
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6).trim();
              if (jsonStr) {
                const event = JSON.parse(jsonStr);
                if (!event.timestamp) {
                  event.timestamp = new Date().toISOString();
                }
                setEvents(prev => [...prev, event]);
              }
            } catch (e) {
              console.warn(`Failed to parse final SSE event:`, e);
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setEvents(prev => [...prev, {
        type: 'error',
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
      readerRef.current = null;
    }
  };

  const handleStop = async () => {
    if (readerRef.current) {
      await readerRef.current.cancel();
      setLoading(false);
      setEvents(prev => [...prev, {
        type: 'error',
        message: "Stream cancelled by user",
        timestamp: new Date().toISOString()
      }]);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-100px)]">
      {/* Sidebar / Configuration */}
      <div className="lg:col-span-4 space-y-6">
        <Card className="h-full">
          <Card.Header className="flex flex-col items-start gap-2 p-4">
            <h2 className="text-2xl font-bold">Analysis Tools</h2>
            <p className="text-small text-default-500">Select a tool to begin analysis</p>
          </Card.Header>
          <Separator />
          <Card.Content className="space-y-6 overflow-visible p-4">
            <Select
              value={selectedTool}
              onChange={(value) => setSelectedTool(String(value))}
              placeholder="Select a tool"
            >
              <Label>Select Tool</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="simple" textValue="Simple Question">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">💬</span>
                      <span>Simple Question</span>
                    </div>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="auto-analyze" textValue="Repo Auto-Analyze">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🔍</span>
                      <span>Repo Auto-Analyze</span>
                    </div>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="pr-analyze" textValue="PR Analysis">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🔄</span>
                      <span>PR Analysis</span>
                    </div>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            <Select
              value={useGemini ? "gemini" : "worker-ai"}
              onChange={(value) => setUseGemini(String(value) === "gemini")}
              placeholder="Select AI provider"
            >
              <Label>AI Provider</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="worker-ai" textValue="Cloudflare Workers AI">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">☁️</span>
                      <span>Cloudflare Workers AI</span>
                    </div>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="gemini" textValue="Google Gemini 2.5 Flash">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✨</span>
                      <span>Google Gemini 2.5 Flash</span>
                    </div>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>

            <Separator />

            {selectedTool === "simple" && (
              <TextField
                name="question"
                value={question}
                onChange={setQuestion}
                className="w-full"
              >
                <Label>Your Question</Label>
                <Input placeholder="e.g., How do I use Durable Objects?" />
                <Description>Ask a single technical question about Cloudflare Workers.</Description>
              </TextField>
            )}

            {selectedTool === "auto-analyze" && (
              <TextField
                name="repoUrl"
                value={repoUrl}
                onChange={setRepoUrl}
                className="w-full"
              >
                <Label>Repository URL</Label>
                <Input placeholder="https://github.com/owner/repo" />
                <Description>Full analysis of a GitHub repository for migration feasibility.</Description>
              </TextField>
            )}

            {selectedTool === "pr-analyze" && (
              <TextField
                name="prUrl"
                value={prUrl}
                onChange={setPrUrl}
                className="w-full"
              >
                <Label>Pull Request URL</Label>
                <Input placeholder="https://github.com/owner/repo/pull/123" />
                <Description>Analyze comments in a PR for Cloudflare-related context.</Description>
              </TextField>
            )}
          </Card.Content>
          <Card.Footer className="p-4">
            {loading ? (
              <Button variant="secondary" onPress={handleStop} className="w-full bg-danger-100 text-danger">
                Stop Analysis
              </Button>
            ) : (
              <Button variant="primary" onPress={handleAnalyze} className="w-full" size="lg">
                Start Analysis
              </Button>
            )}
          </Card.Footer>
        </Card>
      </div>

      {/* Main Output Area */}
      <div className="lg:col-span-8 h-full flex flex-col">
        <Card className="grow bg-background border-default-200 border">
          <Card.Header className="flex justify-between items-center border-b border-default-200 p-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <h3 className="font-bold">Live Output</h3>
            </div>
            {loading && <Spinner size="sm" />}
          </Card.Header>
          <Card.Content className="p-0 bg-black/5 dark:bg-black/20 h-[600px]">
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-default-400 space-y-4">
                <div className="text-6xl opacity-20">📊</div>
                <p>Ready to start analysis...</p>
              </div>
            ) : (
              <StreamViewer events={events} plan={migrationPlan} pillars={pillars} />
            )}
          </Card.Content>
        </Card>
      </div>
    </div>
  );
};
