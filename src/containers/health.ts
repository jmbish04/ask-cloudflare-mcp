import { Env } from "../types";
import { HealthStepResult } from "../core/health-check";

/**
 * Checks the health of Container bindings and availability.
 */
export async function checkHealth(env: Env): Promise<HealthStepResult> {
    const start = Date.now();
    const subChecks: Record<string, any> = {};

    try {
        // 1. Check Repo Analyzer
        if (env.REPO_ANALYZER_CONTAINER) {
            try {
                // Just check if we can get an ID, we don't necessarily need to spin up a container just for a check
                // unless we want to be very thorough. For now, binding existence + ID generation is a good signal.
                const id = env.REPO_ANALYZER_CONTAINER.newUniqueId();
                const stub = env.REPO_ANALYZER_CONTAINER.get(id);
                // Basic property access to ensure stub is valid
                if (stub.id.toString()) {
                    subChecks.repoAnalyzer = "OK";
                }
            } catch (e) {
                subChecks.repoAnalyzer = { status: "FAILURE", error: e instanceof Error ? e.message : String(e) };
            }
        } else {
            subChecks.repoAnalyzer = { status: "WARNING", message: "Binding missing" };
        }

        // 2. Check Sandbox
        if (env.SANDBOX) {
            try {
                const id = env.SANDBOX.newUniqueId();
                const stub = env.SANDBOX.get(id);
                if (stub.id.toString()) {
                    subChecks.sandbox = "OK";
                }
            } catch (e) {
                subChecks.sandbox = { status: "FAILURE", error: e instanceof Error ? e.message : String(e) };
            }
        } else {
            subChecks.sandbox = { status: "WARNING", message: "Binding missing" };
        }

        return {
            name: "Containers",
            status: "success",
            message: "Container bindings operational",
            durationMs: Date.now() - start,
            details: subChecks
        };

    } catch (error) {
        return {
            name: "Containers",
            status: "failure",
            message: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - start,
            details: subChecks
        };
    }
}
