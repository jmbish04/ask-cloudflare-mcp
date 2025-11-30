import { Env, SessionRecord, QuestionRecord } from "../types";
import { logAction } from "./action-logger";

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a session title using Worker AI
 */
export async function generateSessionTitle(
  ai: Ai,
  endpointType: string,
  context?: string
): Promise<string> {
  try {
    const prompt = context
      ? `Generate a concise, descriptive 5-10 word title for a session of type "${endpointType}" with context: ${context}`
      : `Generate a concise, descriptive 5-10 word title for a session of type "${endpointType}"`;

    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 50,
    }) as any;

    return response?.response?.trim() || `${endpointType} session`;
  } catch (error) {
    console.error("Error generating session title:", error);
    return `${endpointType} session`;
  }
}

/**
 * Create a new session
 */
export async function createSession(
  env: Env,
  endpointType: 'simple-questions' | 'detailed-questions' | 'auto-analyze' | 'pr-analyze',
  options: {
    repoUrl?: string;
    title?: string;
    titleContext?: string;
  } = {}
): Promise<{ sessionId: string; sessionDbId: number }> {
  const sessionId = generateSessionId();

  // Generate title using AI if not provided
  const title = options.title || await generateSessionTitle(
    env.AI,
    endpointType,
    options.titleContext || options.repoUrl
  );

  const result = await env.DB
    .prepare(
      `INSERT INTO sessions (session_id, title, endpoint_type, repo_url)
       VALUES (?, ?, ?, ?)
       RETURNING id`
    )
    .bind(sessionId, title, endpointType, options.repoUrl || null)
    .first<{ id: number }>();

  const sessionDbId = result?.id || 0;

  await logAction(env.DB, "session_created", `Created session: ${title}`, {
    sessionId: sessionDbId,
    metadata: { endpoint_type: endpointType, repo_url: options.repoUrl },
  });

  return { sessionId, sessionDbId };
}

/**
 * Get a session by session ID
 */
export async function getSession(
  db: D1Database,
  sessionId: string
): Promise<SessionRecord | null> {
  const result = await db
    .prepare("SELECT * FROM sessions WHERE session_id = ?")
    .bind(sessionId)
    .first<SessionRecord>();

  return result || null;
}

/**
 * Get all sessions
 */
export async function getAllSessions(
  db: D1Database,
  limit: number = 100,
  offset: number = 0
): Promise<SessionRecord[]> {
  const result = await db
    .prepare(
      `SELECT * FROM sessions
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<SessionRecord>();

  return result.results || [];
}

/**
 * Add a question to a session
 */
export async function addQuestion(
  db: D1Database,
  sessionDbId: number,
  question: string,
  response: any,
  questionSource: 'user_provided' | 'ai_generated',
  metadata?: Record<string, any>
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO questions (session_id, question, meta_json, response, question_source)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`
    )
    .bind(
      sessionDbId,
      question,
      metadata ? JSON.stringify(metadata) : null,
      JSON.stringify(response),
      questionSource
    )
    .first<{ id: number }>();

  await logAction(db, "question_added", `Added question to session`, {
    sessionId: sessionDbId,
    metadata: { question_source: questionSource },
  });

  return result?.id || 0;
}

/**
 * Get all questions for a session
 */
export async function getSessionQuestions(
  db: D1Database,
  sessionDbId: number
): Promise<QuestionRecord[]> {
  const result = await db
    .prepare(
      `SELECT * FROM questions
       WHERE session_id = ?
       ORDER BY created_at ASC`
    )
    .bind(sessionDbId)
    .all<QuestionRecord>();

  return result.results || [];
}

/**
 * Update session's updated_at timestamp
 */
export async function updateSession(
  db: D1Database,
  sessionDbId: number
): Promise<void> {
  await db
    .prepare(
      `UPDATE sessions
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(sessionDbId)
    .run();
}
