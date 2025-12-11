import { Container } from "@cloudflare/containers";


/**
 * Container configuration for repository analysis
 * Clones git repositories and serves file contents for analysis
 */
export class RepoAnalyzerContainerConfig extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "5m"; // Keep container alive for 5 minutes after last request

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.envVars = {
      GITHUB_TOKEN: env.GITHUB_TOKEN,
    };
  }

  override onStart() {
    console.log("Repo Analyzer Container started");
  }

  override onStop() {
    console.log("Repo Analyzer Container stopped");
  }

  override onError(error: unknown) {
    console.error("Repo Analyzer Container error:", error);
  }

  async execute(command: string[], options?: any) {
    // @ts-ignore - this.ctx.container is provided by the super class at runtime
    return await this.ctx.container.exec(command, options);
  }
}

