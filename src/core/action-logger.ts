import { eq, desc } from 'drizzle-orm';
import { createDbClient } from "../db/client";
import { actionLogs, ActionLog, NewActionLog } from "../db/schema";

/**
 * Log an action to the D1 database
 */
export async function logAction(
  d1db: D1Database,
  actionType: string,
  actionDescription: string,
  options: {
    sessionId?: number;
    metadata?: Record<string, any>;
    hasError?: boolean;
    errorMessage?: string;
  } = {}
): Promise<void> {
  try {
    const { sessionId, metadata, hasError = false, errorMessage } = options;
    const db = createDbClient(d1db);

    const newLog: NewActionLog = {
      sessionId: sessionId || null,
      actionType,
      actionDescription,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
      hasError,
      errorMessage: errorMessage || null,
    };

    await db.insert(actionLogs).values(newLog);

    console.log(`[ACTION LOG] ${actionType}: ${actionDescription}`, {
      sessionId,
      hasError,
    });
  } catch (error) {
    // Don't let logging errors break the main flow
    console.error("Failed to log action:", error);
  }
}

/**
 * Log an error action
 */
export async function logError(
  db: D1Database,
  actionType: string,
  error: Error,
  options: {
    sessionId?: number;
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  await logAction(db, actionType, `Error: ${error.message}`, {
    ...options,
    hasError: true,
    errorMessage: error.stack || error.message,
  });
}

/**
 * Get action logs for a session
 */
export async function getSessionActionLogs(
  d1db: D1Database,
  sessionId: number
): Promise<ActionLog[]> {
  const db = createDbClient(d1db);
  const result = await db
    .select()
    .from(actionLogs)
    .where(eq(actionLogs.sessionId, sessionId))
    .orderBy(desc(actionLogs.timestamp));
  return result;
}

/**
 * Get all action logs with error status
 */
export async function getActionLogsWithErrors(
  d1db: D1Database,
  limit: number = 100
): Promise<ActionLog[]> {
  const db = createDbClient(d1db);
  const result = await db
    .select()
    .from(actionLogs)
    .where(eq(actionLogs.hasError, true))
    .orderBy(desc(actionLogs.timestamp))
    .limit(limit);
  return result;
}
