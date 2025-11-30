import { useState, useEffect, useRef } from 'react';
import { 
  Card, 
  Input, 
  Button, 
  Select,
  SelectItem,
  Divider,
  ScrollShadow,
  Spinner,
  Accordion,
  AccordionItem
} from "@heroui/react";
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

import { motion, AnimatePresence } from "framer-motion";

interface AnalysisEvent {
  type: 'progress' | 'data' | 'error' | 'complete';
  message?: string;
  data?: any;
  timestamp?: string;
}

const StreamViewer = ({ events }: { events: AnalysisEvent[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <ScrollShadow className="h-[600px] w-full" ref={scrollRef}>
      <div className="space-y-4 p-4">
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
                <div className="font-mono text-sm text-default-500 flex gap-2">
                  <span className="text-blue-500">[{new Date(event.timestamp || '').toLocaleTimeString()}]</span>
                  <span>{event.message}</span>
                </div>
              )}

              {/* Errors */}
              {event.type === 'error' && (
                <Card className="bg-danger-50 border-danger-200 border">
                  <Card.Body className="text-danger">
                    <p className="font-bold">Error</p>
                    <p>{event.message}</p>
                  </Card.Body>
                </Card>
              )}

              {/* Structured Data Results */}
              {event.type === 'data' && event.data && (
                <Card className="bg-content2 dark:bg-content1 border-default-200 border">
                  <Card.Body className="space-y-4">
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
                                : event.data.original_question.query || JSON.stringify(event.data.original_question)}
                          </div>
                       </div>
                     )}

                     {/* MCP Response */}
                     {event.data.mcp_response && (
                       <Accordion variant="splitted">
                         <AccordionItem key="1" aria-label="MCP Response" title="Cloudflare Documentation Context">
                           <div className="prose dark:prose-invert max-w-none text-sm">
                             <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                               {typeof event.data.mcp_response === 'string' 
                                 ? event.data.mcp_response 
                                 : JSON.stringify(event.data.mcp_response, null, 2)}
                             </ReactMarkdown>
                           </div>
                         </AccordionItem>
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
                  </Card.Body>
                </Card>
              )}

              {/* Completion */}
              {event.type === 'complete' && (
                <Card className="bg-success-50 border-success-200 border">
                  <Card.Body className="text-success font-bold text-center">
                    {event.data?.sessionId && <div className="text-sm mb-2">Session ID: {event.data.sessionId}</div>}
                    Analysis Complete!
                  </Card.Body>
                </Card>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ScrollShadow>
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
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setEvents([]);
    
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

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep partial line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              const event = JSON.parse(jsonStr);
              setEvents(prev => [...prev, event]);
            } catch (e) {
              console.warn("Failed to parse event:", line);
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
          <Card.Header className="flex flex-col items-start gap-2">
            <h2 className="text-2xl font-bold">Analysis Tools</h2>
            <p className="text-small text-default-500">Select a tool to begin analysis</p>
          </Card.Header>
          <Divider/>
          <Card.Body className="space-y-6 overflow-visible">
            <Select 
              label="Select Tool" 
              selectedKeys={[selectedTool]} 
              onChange={(e) => setSelectedTool(e.target.value)}
            >
              <SelectItem key="simple" startContent={<span className="text-xl">💬</span>}>
                Simple Question
              </SelectItem>
              <SelectItem key="auto-analyze" startContent={<span className="text-xl">🔍</span>}>
                Repo Auto-Analyze
              </SelectItem>
              <SelectItem key="pr-analyze" startContent={<span className="text-xl">🔄</span>}>
                PR Analysis
              </SelectItem>
            </Select>

            <Select 
              label="AI Provider" 
              selectedKeys={[useGemini ? "gemini" : "worker-ai"]}
              onChange={(e) => setUseGemini(e.target.value === "gemini")}
            >
              <SelectItem key="worker-ai" startContent={<span className="text-lg">☁️</span>}>
                Cloudflare Workers AI
              </SelectItem>
              <SelectItem key="gemini" startContent={<span className="text-lg">✨</span>}>
                Google Gemini 2.5 Flash
              </SelectItem>
            </Select>

            <Divider/>

            {selectedTool === "simple" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Question</label>
                <Input
                  placeholder="e.g., How do I use Durable Objects?"
                  value={question}
                  onValueChange={setQuestion}
                  size="lg"
                />
                <p className="text-xs text-default-400">
                  Ask a single technical question about Cloudflare Workers.
                </p>
              </div>
            )}

            {selectedTool === "auto-analyze" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Repository URL</label>
                <Input
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onValueChange={setRepoUrl}
                  size="lg"
                />
                <p className="text-xs text-default-400">
                  Full analysis of a GitHub repository for migration feasibility.
                </p>
              </div>
            )}

            {selectedTool === "pr-analyze" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Pull Request URL</label>
                <Input
                  placeholder="https://github.com/owner/repo/pull/123"
                  value={prUrl}
                  onValueChange={setPrUrl}
                  size="lg"
                />
                <p className="text-xs text-default-400">
                  Analyze comments in a PR for Cloudflare-related context.
                </p>
              </div>
            )}
          </Card.Body>
          <Card.Footer>
            {loading ? (
              <Button color="danger" variant="flat" onPress={handleStop} className="w-full">
                Stop Analysis
              </Button>
            ) : (
              <Button color="primary" onPress={handleAnalyze} className="w-full" size="lg">
                Start Analysis
              </Button>
            )}
          </Card.Footer>
        </Card>
      </div>

      {/* Main Output Area */}
      <div className="lg:col-span-8 h-full flex flex-col">
        <Card className="flex-grow bg-background border-default-200 border">
          <Card.Header className="flex justify-between items-center border-b border-default-200">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚡</span>
              <h3 className="font-bold">Live Output</h3>
            </div>
            {loading && <Spinner size="sm" color="primary" />}
          </Card.Header>
          <Card.Body className="p-0 bg-black/5 dark:bg-black/20">
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-default-400 space-y-4">
                <div className="text-6xl opacity-20">📊</div>
                <p>Ready to start analysis...</p>
              </div>
            ) : (
              <StreamViewer events={events} />
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  );
};

