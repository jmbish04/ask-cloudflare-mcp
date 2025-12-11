import {
  Card,
  Separator,
  Link,
  Button,
  Input
} from "@heroui/react";
import { Link as RouterLink } from "react-router-dom";

const pages = [
  {
    title: "Session Dashboard",
    description: "View and manage your API sessions",
    icon: "📊",
    path: "/sessions",
    color: "from-blue-500 to-cyan-500"
  },
  {
    title: "Analysis Tools",
    description: "Real-time analysis with live MCP responses",
    icon: "⚡",
    path: "/tools",
    color: "from-yellow-500 to-orange-500"
  },
  {
    title: "Interactive API Docs",
    description: "Explore and test endpoints with Swagger UI",
    icon: "📖",
    path: "/docs",
    color: "from-green-500 to-emerald-500"
  },
  {
    title: "OpenAPI Schema",
    description: "Download the complete API specification",
    icon: "📋",
    href: "/openapi.json",
    color: "from-purple-500 to-pink-500",
    isExternal: true
  },
  {
    title: "Usage Examples",
    description: "See example requests and responses",
    icon: "💡",
    path: "/examples",
    color: "from-pink-500 to-rose-500"
  },
  {
    title: "WebSocket/MCP",
    description: "Real-time communication guide",
    icon: "🔌",
    path: "/mcp-guide",
    color: "from-red-500 to-rose-500"
  }
];

import { StaggerContainer, StaggerItem } from "../components/MotionWrapper";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchWithAuth } from "../utils/api";

const researchModes = [
  {
    mode: "feasibility",
    title: "Feasibility Auditor",
    description: "Can I build X with Cloudflare? Get a deep technical assessment.",
    icon: "🏗️",
    color: "from-purple-600 to-indigo-600"
  },
  {
    mode: "enrichment",
    title: "PRD Enricher",
    description: "Expand your Feature Requirements with Cloudflare-specific implementation details.",
    icon: "✨",
    color: "from-emerald-600 to-teal-600"
  },
  {
    mode: "error_fix",
    title: "Error Fixer",
    description: "Paste a cryptic error log and get a deep root cause analysis.",
    icon: "🐛",
    color: "from-red-600 to-orange-600"
  }
];

export const Home = () => {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleCardClick = (mode: string) => {
    setSelectedMode(mode);
    setQuery("");
    setIsOpen(true);
  };

  const handleStartResearch = async () => {
    if (!query.trim() || !selectedMode) return;

    setIsLoading(true);
    try {
      const res = await fetchWithAuth('/api/research', {
        method: 'POST',
        body: JSON.stringify({ query, mode: selectedMode })
      });

      if (!res.ok) throw new Error("Failed to start research");

      const data = await res.json();
      navigate(`/research/${data.sessionId}`);
    } catch (e) {
      console.error(e);
      alert("Failed to start research session");
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-linear-to-r from-blue-500 to-purple-500">
          Ask Cloudflare MCP
        </h1>
        <p className="text-default-500">
          AI-powered analysis for Cloudflare Workers migration and development
        </p>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-6">Deep Research Agents</h2>
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {researchModes.map((mode) => (
            <StaggerItem key={mode.mode}>
              <div onClick={() => handleCardClick(mode.mode)} className="cursor-pointer h-full">
                <Card className="hover:scale-105 transition-transform duration-200 h-full w-full text-left p-4">
                  <div className="flex gap-3 mb-4">
                    <div className={`text-2xl p-2 rounded-lg bg-linear-to-br ${mode.color} text-white`}>
                      {mode.icon}
                    </div>
                    <div className="flex flex-col justify-center">
                      <p className="text-md font-bold">{mode.title}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-default-500">{mode.description}</p>
                  </div>
                </Card>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>

      <Separator />

      <div>
        <h2 className="text-2xl font-bold mb-6">Quick Tools</h2>
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pages.map((page) => (
            <StaggerItem key={page.title}>
              <Card className="hover:scale-105 transition-transform duration-200 h-full p-4">
                <div className="flex gap-3 mb-4">
                  <div className={`text-2xl p-2 rounded-lg bg-linear-to-br ${page.color} text-white`}>
                    {page.icon}
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-md font-bold">{page.title}</p>
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-default-500">{page.description}</p>
                </div>
                <div>
                  {page.isExternal ? (
                    <Link href={page.href} target="_blank" rel="noopener noreferrer" className="text-primary">
                      Open Link
                    </Link>
                  ) : (
                    <RouterLink to={page.path!} className="text-primary hover:underline">
                      Go to Page
                    </RouterLink>
                  )}
                </div>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl">
            <h3 className="text-xl font-bold mb-2">Start {researchModes.find(m => m.mode === selectedMode)?.title}</h3>
            <p className="text-default-500 mb-4">
              {researchModes.find(m => m.mode === selectedMode)?.description}
            </p>

            <Input
              placeholder="Describe your task or paste your query..."
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              autoFocus
              className="mb-6"
            />

            <div className="flex justify-end gap-2">
              <Button onPress={() => setIsOpen(false)} className="bg-transparent text-red-500 hover:bg-red-50">
                Cancel
              </Button>
              <Button onPress={handleStartResearch} isDisabled={isLoading} className="bg-blue-600 text-white hover:bg-blue-700">
                {isLoading ? "Starting..." : "Start Research"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
