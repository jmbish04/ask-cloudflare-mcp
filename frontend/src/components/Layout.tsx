import { 
  Navbar, 
  NavbarBrand, 
  NavbarContent, 
  NavbarItem, 
  Link 
} from "@heroui/react";
import { Link as RouterLink, useLocation } from "react-router-dom";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <Navbar isBordered>
        <NavbarBrand>
          <RouterLink to="/" className="font-bold text-inherit">Ask Cloudflare MCP</RouterLink>
        </NavbarBrand>
        <NavbarContent className="hidden sm:flex gap-4" justify="center">
          <NavbarItem isActive={location.pathname === "/"}>
            <RouterLink to="/" className={location.pathname === "/" ? "text-primary" : "text-foreground"}>
              Home
            </RouterLink>
          </NavbarItem>
          <NavbarItem isActive={location.pathname === "/sessions"}>
            <RouterLink to="/sessions" className={location.pathname === "/sessions" ? "text-primary" : "text-foreground"}>
              Sessions
            </RouterLink>
          </NavbarItem>
          <NavbarItem isActive={location.pathname === "/streaming"}>
            <RouterLink to="/streaming" className={location.pathname === "/streaming" ? "text-primary" : "text-foreground"}>
              Streaming
            </RouterLink>
          </NavbarItem>
          <NavbarItem isActive={location.pathname === "/docs"}>
            <RouterLink to="/docs" className={location.pathname === "/docs" ? "text-primary" : "text-foreground"}>
              Docs
            </RouterLink>
          </NavbarItem>
          <NavbarItem isActive={location.pathname === "/examples"}>
            <RouterLink to="/examples" className={location.pathname === "/examples" ? "text-primary" : "text-foreground"}>
              Examples
            </RouterLink>
          </NavbarItem>
        </NavbarContent>
        <NavbarContent justify="end">
          <NavbarItem>
            <Link isExternal href="https://github.com/jmbish04/ask-cloudflare-mcp" showAnchorIcon>
              GitHub
            </Link>
          </NavbarItem>
        </NavbarContent>
      </Navbar>
      <main className="container mx-auto max-w-7xl pt-16 px-6 flex-grow">
        {children}
      </main>
    </div>
  );
};
