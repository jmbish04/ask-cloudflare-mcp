import { 
  Card, 
  CardHeader, 
  CardBody, 
  Divider,
  Snippet
} from "@heroui/react";

export const Examples = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold">Usage Examples</h2>
        <p className="text-default-500">Example requests for common use cases</p>
      </div>

      <Card>
        <CardHeader className="font-bold">Simple Question</CardHeader>
        <Divider/>
        <CardBody>
          <p className="mb-4">Ask a straightforward technical question about Cloudflare Workers.</p>
          <Snippet symbol="$" className="w-full">
{`curl -X POST https://your-worker-url/api/questions/simple \\
  -H "Content-Type: application/json" \\
  -d '{
    "questions": ["How do I use Durable Objects?"],
    "use_gemini": true
  }'`}
          </Snippet>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-bold">Repository Auto-Analyze</CardHeader>
        <Divider/>
        <CardBody>
          <p className="mb-4">Analyze a GitHub repository for migration compatibility.</p>
          <Snippet symbol="$" className="w-full">
{`curl -X POST https://your-worker-url/api/questions/auto-analyze?stream=true \\
  -H "Content-Type: application/json" \\
  -d '{
    "repo_url": "https://github.com/owner/repo",
    "use_gemini": true
  }'`}
          </Snippet>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-bold">PR Analysis</CardHeader>
        <Divider/>
        <CardBody>
          <p className="mb-4">Analyze comments in a Pull Request for Cloudflare context.</p>
          <Snippet symbol="$" className="w-full">
{`curl -X POST https://your-worker-url/api/questions/pr-analyze?stream=true \\
  -H "Content-Type: application/json" \\
  -d '{
    "pr_url": "https://github.com/owner/repo/pull/123",
    "comment_filter": "copilot"
  }'`}
          </Snippet>
        </CardBody>
      </Card>
    </div>
  );
};

