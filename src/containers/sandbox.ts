import { Container } from "@cloudflare/containers";
import { Env } from "../types";


/**
 * Sandbox container configuration
 * Provides an isolated environment for executing code
 */
export class Sandbox extends Container<Env> {
    defaultPort = 8081;
    // Keep alive for a short period to allow for sequential execution, but shut down quickly to save resources
    sleepAfter = "5m";

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
        this.envVars = {
            NODE_ENV: "production",
            GITHUB_TOKEN: env.GITHUB_TOKEN,
        };
    }

    override onStart() {
        console.log("Sandbox Container started");
    }

    override onStop() {
        console.log("Sandbox Container stopped");
    }

    override onError(error: unknown) {
        console.error("Sandbox Container error:", error);
    }

    async execute(command: string[], options?: any) {
        // @ts-ignore - this.ctx.container is provided by the super class at runtime
        return await this.ctx.container.exec(command, options);
    }
}
