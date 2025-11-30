import { useState } from 'react'
import { 
  Card, 
  CardHeader, 
  CardBody, 
  CardFooter,
  Input, 
  Button, 
  Spinner,
  Select,
  SelectItem,
  Divider,
  ScrollShadow
} from "@heroui/react"

function App() {
  const [question, setQuestion] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [prUrl, setPrUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [mode, setMode] = useState<string>("simple") // simple, detailed, auto-analyze, pr-analyze
  const [useGemini, setUseGemini] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const handleAnalyze = async () => {
    setLoading(true)
    setLogs([])
    setResults(null)

    try {
      let endpoint = ''
      let body = {}

      // Construct request based on mode
      if (mode === "simple") {
        endpoint = "/api/questions/simple"
        body = { questions: [question], use_gemini: useGemini }
      } else if (mode === "detailed") {
        endpoint = "/api/questions/detailed"
        // Note: In a real app, we'd parse repo owner/name and relevant files
        body = { 
          questions: [{
            query: question,
            cloudflare_bindings_involved: [],
            node_libs_involved: [],
            tags: [],
            relevant_code_files: []
          }],
          use_gemini: useGemini 
        }
      } else if (mode === "auto-analyze") {
        endpoint = "/api/questions/auto-analyze?stream=true"
        body = { repo_url: repoUrl, use_gemini: useGemini }
      } else if (mode === "pr-analyze") {
        endpoint = "/api/questions/pr-analyze?stream=true"
        body = { pr_url: prUrl, use_gemini: useGemini }
      }

      // Handle streaming response
      if (mode === "auto-analyze" || mode === "pr-analyze") {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })

        if (!response.body) throw new Error("No response body")
        
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const text = decoder.decode(value)
          // Split by newline and process logs
          const lines = text.split('\n')
          setLogs(prev => [...prev, ...lines.filter(l => l.trim())])
        }
        setLoading(false)
      } else {
        // Standard JSON response
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await response.json()
        setResults(data)
        setLoading(false)
      }

    } catch (error) {
      console.error(error)
      setLogs(prev => [...prev, `Error: ${error}`])
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-8 text-foreground dark">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500">
            Ask Cloudflare MCP
          </h1>
          <p className="text-default-500">
            AI-powered analysis for Cloudflare Workers migration and development
          </p>
        </div>

        <Card className="w-full">
          <CardHeader className="flex gap-3">
            <div className="flex flex-col">
              <p className="text-md">Analysis Configuration</p>
              <p className="text-small text-default-500">Configure your query parameters</p>
            </div>
          </CardHeader>
          <Divider/>
          <CardBody className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select 
                label="Analysis Mode" 
                selectedKeys={[mode]} 
                onChange={(e) => setMode(e.target.value)}
              >
                <SelectItem key="simple">Simple Question</SelectItem>
                <SelectItem key="detailed">Detailed Analysis</SelectItem>
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

            {mode === "detailed" && (
              <Input
                label="Detailed Question"
                placeholder="How do I migrate this specific file?"
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
              {loading ? "Analyzing..." : "Run Analysis"}
            </Button>
          </CardFooter>
        </Card>

        {(loading || logs.length > 0) && (
          <Card className="w-full bg-black/50">
            <CardHeader>
              <p className="text-sm font-mono text-default-500">Analysis Logs</p>
            </CardHeader>
            <CardBody>
              <ScrollShadow className="h-[300px] font-mono text-sm">
                {logs.map((log, i) => (
                  <div key={i} className="mb-1">{log}</div>
                ))}
                {loading && <Spinner size="sm" color="default" />}
              </ScrollShadow>
            </CardBody>
          </Card>
        )}

        {results && (
          <Card className="w-full">
            <CardHeader>
              <p className="text-md font-bold">Results</p>
            </CardHeader>
            <CardBody>
              <pre className="whitespace-pre-wrap bg-default-100 p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(results, null, 2)}
              </pre>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  )
}

export default App
