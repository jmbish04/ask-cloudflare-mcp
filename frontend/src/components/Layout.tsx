import {
  Link
} from "@heroui/react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { HealthBadge } from "./HealthBadge";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <nav className="sticky top-0 z-40 w-full h-16 border-b border-default-200 bg-background/70 backdrop-blur-lg backdrop-saturate-150">
        <div className="container mx-auto h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <RouterLink to="/" className="font-bold text-inherit text-xl">Ask Cloudflare MCP</RouterLink>

            <div className="hidden sm:flex gap-4 ml-8">
              <RouterLink to="/" className={`text-sm ${location.pathname === "/" ? "text-primary font-medium" : "text-foreground hover:text-primary"}`}>
                Home
              </RouterLink>
              <RouterLink to="/chat" className={`text-sm ${location.pathname === "/chat" ? "text-primary font-medium" : "text-foreground hover:text-primary"}`}>
                Chat
              </RouterLink>
              <RouterLink to="/sessions" className={`text-sm ${location.pathname === "/sessions" ? "text-primary font-medium" : "text-foreground hover:text-primary"}`}>
                Sessions
              </RouterLink>
              <RouterLink to="/tools" className={`text-sm ${location.pathname === "/tools" ? "text-primary font-medium" : "text-foreground hover:text-primary"}`}>
                Tools
              </RouterLink>
              <RouterLink to="/docs" className={`text-sm ${location.pathname === "/docs" ? "text-primary font-medium" : "text-foreground hover:text-primary"}`}>
                Docs
              </RouterLink>
              <RouterLink to="/examples" className={`text-sm ${location.pathname === "/examples" ? "text-primary font-medium" : "text-foreground hover:text-primary"}`}>
                Examples
              </RouterLink>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <HealthBadge />
            <Link
              href={`${import.meta.env.VITE_WORKER_URL || window.location.origin}/openapi.json`}
              className="text-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              openapi.json <Link.Icon />
            </Link>
            <Link href="https://github.com/jmbish04/ask-cloudflare-mcp" target="_blank" rel="noopener noreferrer" className="text-sm">
              GitHub <Link.Icon />
            </Link>
          </div>
        </div>
      </nav>
      <main className="container mx-auto max-w-7xl pt-16 px-6 grow">
        {children}
      </main>
    </div>
  );
};
