import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

interface TerminalProps {
    containerName: string;
    wsUrl?: string; // Optional override
}

export const TerminalComponent = ({ containerName, wsUrl }: TerminalProps) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const xtermRef = useRef<Terminal | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize xterm.js
        const term = new Terminal({
            cursorBlink: true,
            theme: {
                background: "#1e1e1e",
                foreground: "#ffffff",
            },
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();
        xtermRef.current = term;

        // Connect WebSocket
        // Default to current host + /ws
        const url = wsUrl || `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            term.writeln(`\x1b[32mConnected to ${containerName} terminal...\x1b[0m`);
            // Initialize terminal session
            ws.send(JSON.stringify({
                type: "terminal_init",
                data: { container: containerName }
            }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === "terminal_output") {
                    term.write(msg.data);
                } else if (msg.type === "error") {
                    term.writeln(`\r\n\x1b[31mError: ${msg.data.error}\x1b[0m`);
                }
            } catch (e) {
                // If not JSON, maybe raw text?
                // term.write(event.data);
            }
        };

        ws.onclose = () => {
            term.writeln("\r\n\x1b[31mConnection closed.\x1b[0m");
        };

        // Handle input
        term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "terminal_input",
                    data: { input: data }
                }));
            }
        });

        // Handle resize
        const handleResize = () => fitAddon.fit();
        window.addEventListener("resize", handleResize);

        return () => {
            ws.close();
            term.dispose();
            window.removeEventListener("resize", handleResize);
        };
    }, [containerName, wsUrl]); // Re-run if container changes

    return <div ref={terminalRef} style={{ width: "100%", height: "100%" }} />;
};
