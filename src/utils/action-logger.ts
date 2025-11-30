import { Env } from "../types";

/**
 * Log an action to the D1 database
 */
export async function logAction(
  db: D1Database,
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

    await db
      .prepare(
        `INSERT INTO action_logs (session_id, action_type, action_description, metadata_json, has_error, error_message)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        sessionId || null,
        actionType,
        actionDescription,
        metadata ? JSON.stringify(metadata) : null,
        hasError ? 1 : 0,
        errorMessage || null
      )
      .run();

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
  db: D1Database,
  sessionId: number
): Promise<any[]> {
  const result = await db
    .prepare(
      `SELECT * FROM action_logs
       WHERE session_id = ?
       ORDER BY timestamp DESC`
    )
    .bind(sessionId)
    .all();

  return result.results || [];
}

/**
 * Get all action logs with error status
 */
export async function getActionLogsWithErrors(
  db: D1Database,
  limit: number = 100
): Promise<any[]> {
  const result = await db
    .prepare(
      `SELECT * FROM action_logs
       WHERE has_error = 1
       ORDER BY timestamp DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();

  return result.results || [];
}
