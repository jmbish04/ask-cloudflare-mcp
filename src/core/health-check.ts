import { Env } from "../types";
import { createDbClient } from "../db/client";
import { healthChecks, NewHealthCheck } from "../db/schema";
import { checkHealth as checkAI } from "../ai/health";
import { checkHealth as checkMCP } from "../mcp/health";
import { checkHealth as checkDB } from "../db/health";
import { checkHealth as checkData } from "../data/health";
import { checkHealth as checkGit } from "../mcp/tools/git/health";
import { checkHealth as checkContainers } from "../containers/health";
import { checkHealth as checkAgents } from "../ai/agents/health";
import { checkHealth as checkWorkflows } from "../workflows/health";
import { checkHealth as checkBrowser } from "../mcp/tools/browser-health";
import { generateText } from "../ai/providers/worker-ai";
import { analyzeFailure } from "../ai/utils/diagnostician";

export interface HealthStepResult {
  name: string;
  status: 'success' | 'failure' | 'warning' | 'SKIPPED';
  message: string;
  durationMs: number;
  details?: any;
  analysis?: import('../ai/utils/diagnostician').HealthFailureAnalysis;
}

export interface HealthCheckResult {
  success: boolean;
  steps: HealthStepResult[];
  totalDurationMs: number;
  error?: string;
}

/**
 * Health Orchestrator
 * Runs decentralized checks across all domains
 */
export async function runHealthCheck(
  env: Env,
  checkType: string,
  triggerSource: 'cron' | 'api' | 'websocket',
  onProgress?: (step: string, status: 'pending' | 'success' | 'failure' | 'warning' | 'SKIPPED', msg?: string) => void
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const steps: HealthStepResult[] = [];
  const notify = onProgress || (() => { });

  notify("Starting Health Check", "pending", "Initializing...");

  // Define checks sequence
  const checks = [
    { id: 'db', name: 'Database', fn: checkDB },
    { id: 'data', name: 'Vectorize', fn: checkData },
    { id: 'ai', name: 'Worker AI', fn: checkAI },
    { id: 'mcp', name: 'MCP Server', fn: checkMCP },
    { id: 'git', name: 'GitHub API', fn: checkGit },
    { id: 'containers', name: 'Containers', fn: checkContainers },
    { id: 'agents', name: 'Agents', fn: checkAgents },
    { id: 'workflows', name: 'Workflows', fn: checkWorkflows }
  ];

  try {
    for (const check of checks) {
      notify(check.name, "pending", `Checking ${check.name}...`);

      const result = await check.fn(env);
      steps.push(result);

      notify(check.name, result.status, result.message);

      // Fail fast? No, we want a full report usually.
      // But if DB fails, we might not be able to save results.
    }

    const totalDuration = Date.now() - startTime;
    const strictSuccess = steps.every(s => s.status === 'success');

    let aiAnalysis: string | undefined;
    let aiAnalysisJson: string | undefined;

    if (strictSuccess) {
      notify("Health Check Complete", "success", `Passed in ${totalDuration}ms`);
    } else {
      notify("Health Check Complete", "failure", `Failed in ${totalDuration}ms`);

      // Perform AI Analysis on failure
      try {
        notify("AI Analyst", "pending", "Analyzing root cause...");
        const failedSteps = steps.filter(s => s.status === 'failure');

        // Run specific analysis for each failure
        const analyses = await Promise.all(failedSteps.map(async (step) => {
          // Ensure all values are defined to prevent AI hallucination
          const stepName = step.name || "Unknown Step";
          const stepMessage = step.message || "No error message provided";
          const stepDetails = step.details || {};

          console.log("[Diagnostician Input]", { stepName, stepMessage, stepDetails });

          const analysis = await analyzeFailure(env, stepName, stepMessage, stepDetails);
          if (analysis) {
            step.analysis = analysis; // Attach to step Result
            return { step: step.name, analysis };
          }
          return null;
        }));

        const validAnalyses = analyses.filter(a => a !== null);

        if (validAnalyses.length > 0) {
          // Store structured analysis map
          const analysisMap = validAnalyses.reduce((acc, curr) => {
            acc[curr!.step] = curr!.analysis;
            return acc;
          }, {} as Record<string, any>);

          aiAnalysisJson = JSON.stringify(analysisMap);

          // Legacy text summary (for backward compat or simple view)
          aiAnalysis = validAnalyses.map(a =>
            `[${a!.step}] ${a!.analysis.rootCause} (Fix: ${a!.analysis.suggestedFix})`
          ).join('\n');

          notify("AI Analyst", "success", `Analyzed ${validAnalyses.length} issues`);
        } else {
          notify("AI Analyst", "success", "No specific analysis generated");
        }

      } catch (err) {
        console.error("AI Analysis failed:", err);
        notify("AI Analyst", "failure", "Could not generate analysis");
      }
    }

    // Record result
    await saveHealthCheck(env.DB, {
      checkType,
      triggerSource,
      status: strictSuccess ? 'success' : 'failure',
      durationMs: totalDuration,
      stepsJson: JSON.stringify(steps),
      aiAnalysis, // keep legacy field populated for now
      aiAnalysisJson,
      error: strictSuccess ? undefined : "One or more steps failed"
    });

    return {
      success: strictSuccess,
      steps,
      totalDurationMs: totalDuration
    };

  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    notify("Critical Failure", "failure", errorMsg);

    // Record failure
    await saveHealthCheck(env.DB, {
      checkType,
      triggerSource,
      status: 'failure',
      durationMs: totalDuration,
      stepsJson: JSON.stringify(steps),
      error: errorMsg
    });

    return {
      success: false,
      steps,
      totalDurationMs: totalDuration,
      error: errorMsg
    };
  }
}

async function saveHealthCheck(db: D1Database, check: NewHealthCheck) {
  try {
    const client = createDbClient(db);
    await client.insert(healthChecks).values(check);
  } catch (e) {
    console.error("Failed to save health check result:", e);
  }
}

export async function getLatestHealthCheck(db: D1Database) {
  const client = createDbClient(db);
  // @ts-ignore - simple select
  const result = await client.query.healthChecks.findFirst({
    orderBy: (healthChecks, { desc }) => [desc(healthChecks.timestamp)],
  });
  return result;
}
