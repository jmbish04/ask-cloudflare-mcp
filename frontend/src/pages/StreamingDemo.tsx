// Reuse the streaming logic from the original App.tsx
import { useState } from 'react';
import { 
  Card, 
  CardHeader, 
  CardBody, 
  CardFooter,
  Input, 
  Button, 
  Select,
  SelectItem,
  Divider,
  ScrollShadow
} from "@heroui/react";

export const StreamingDemo = () => {
  const [question, setQuestion] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [prUrl, setPrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<string>("auto-analyze");
  const [useGemini, setUseGemini] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const handleAnalyze = async () => {
    setLoading(true);
    setLogs([]);

    try {
      let endpoint = '';
      let body = {};

      if (mode === "simple") {
        endpoint = "/api/questions/simple?stream=true";
        body = { questions: [question], use_gemini: useGemini };
      } else if (mode === "detailed") {
        // Detailed endpoint doesn't support streaming in the same way yet, fallback to auto-analyze for demo
        endpoint = "/api/questions/auto-analyze?stream=true";
        body = { repo_url: repoUrl, use_gemini: useGemini };
      } else if (mode === "auto-analyze") {
        endpoint = "/api/questions/auto-analyze?stream=true";
        body = { repo_url: repoUrl, use_gemini: useGemini };
      } else if (mode === "pr-analyze") {
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
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split('\n');
        setLogs(prev => [...prev, ...lines.filter(l => l.trim())]);
      }
      setLoading(false);

    } catch (error) {
      console.error(error);
      setLogs(prev => [...prev, `Error: ${error}`]);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">Streaming Analysis Demo</h2>
        <p className="text-default-500">Run long-running analysis tasks with real-time feedback</p>
      </div>

      <Card className="w-full">
        <CardHeader>Configuration</CardHeader>
        <Divider/>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select 
              label="Analysis Mode" 
              selectedKeys={[mode]} 
              onChange={(e) => setMode(e.target.value)}
            >
              <SelectItem key="simple">Simple Question</SelectItem>
              <SelectItem key="auto-analyze">Repo Auto-Analyze</SelectItem>
              <SelectItem key="pr-analyze">PR Analysis</SelectItem>
            </Select>

            <Select 
              label="AI Provider" 
              selectedKeys={[useGemini ? "gemini" : "worker-ai"]}
              onChange={(e) => setUseGemini(e.target.value === "gemini")}
            >
              <SelectItem key="worker-ai">Cloudflare Workers AI</SelectItem>
              <SelectItem key="gemini">Google Gemini 2.5 Flash</SelectItem>
            </Select>
          </div>

          {mode === "simple" && (
            <Input
              label="Question"
              placeholder="How do I use Durable Objects?"
              value={question}
              onValueChange={setQuestion}
            />
          )}

          {mode === "auto-analyze" && (
            <Input
              label="Repository URL"
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onValueChange={setRepoUrl}
            />
          )}

          {mode === "pr-analyze" && (
            <Input
              label="Pull Request URL"
              placeholder="https://github.com/owner/repo/pull/123"
              value={prUrl}
              onValueChange={setPrUrl}
            />
          )}
        </CardBody>
        <Divider/>
        <CardFooter>
          <Button 
            color="primary" 
            className="w-full" 
            onPress={handleAnalyze}
            isLoading={loading}
          >
            {loading ? "Analyzing..." : "Start Stream"}
          </Button>
        </CardFooter>
      </Card>

      <Card className="w-full bg-black border-none">
        <CardHeader className="text-default-400 font-mono text-sm">
          Terminal Output
        </CardHeader>
        <CardBody>
          <ScrollShadow className="h-[400px] font-mono text-sm text-green-400">
            {logs.length === 0 && !loading && (
              <div className="text-default-600">Ready to start...</div>
            )}
            {logs.map((log, i) => (
              <div key={i} className="mb-1 break-all">{log}</div>
            ))}
            {loading && (
              <div className="mt-2 animate-pulse">_</div>
            )}
          </ScrollShadow>
        </CardBody>
      </Card>
    </div>
  );
};

