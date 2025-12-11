import { Env } from "../types";
import { runHealthCheck } from "../core/health-check";

export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  console.log(`[Cron] Starting scheduled task: ${controller.cron}`);

  let checkType = 'cron-manual';

  // Match against configured strings in wrangler.toml
  if (controller.cron === "0 0 * * SUN") {
    checkType = 'cron-weekly';
  } else if (controller.cron === "0 0 * * MON-SAT") {
    checkType = 'cron-nightly';
  } else {
    // Fallback logic if strings don't match
    // Run every 24 hours (nightly)
    if (controller.cron === "0 0 * * *") {
      console.log("Triggering nightly maintenance...");
      await env.MAINTENANCE_WORKFLOW.create({
        id: crypto.randomUUID(),
        params: { force: false }
      });
    }
    const date = new Date(controller.scheduledTime);
    const isSunday = date.getUTCDay() === 0;
    checkType = isSunday ? 'cron-weekly' : 'cron-nightly';
  }

  console.log(`[Cron] Detected ${checkType} from expression: "${controller.cron}"`);

  // Use waitUntil to ensure the health check completes even if the handler returns early
  ctx.waitUntil(
    runHealthCheck(env, checkType, 'cron', (step, status, msg) =>
      console.log(`[Cron] [${step}] ${status}: ${msg}`)
    )
  );
}
