import { 
  Card, 
  Divider,
  Link
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

export const Home = () => {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-linear-to-r from-blue-500 to-purple-500">
          Ask Cloudflare MCP
        </h1>
        <p className="text-default-500">
          AI-powered analysis for Cloudflare Workers migration and development
        </p>
      </div>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pages.map((page) => (
          <StaggerItem key={page.title}>
            <Card className="hover:scale-105 transition-transform duration-200 h-full">
              <Card.Header className="flex gap-3">
                <div className={`text-2xl p-2 rounded-lg bg-linear-to-br ${page.color} text-white`}>
                  {page.icon}
                </div>
                <div className="flex flex-col">
                  <p className="text-md font-bold">{page.title}</p>
                </div>
              </Card.Header>
              <Divider/>
              <Card.Body>
                <p className="text-default-500">{page.description}</p>
              </Card.Body>
              <Divider/>
              <Card.Footer>
                {page.isExternal ? (
                  <Link isExternal href={page.href} color="primary">
                    Open Link
                  </Link>
                ) : (
                  <RouterLink to={page.path!} className="text-primary hover:underline">
                    Go to Page
                  </RouterLink>
                )}
              </Card.Footer>
            </Card>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
};
