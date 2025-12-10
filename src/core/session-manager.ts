import { eq, desc } from 'drizzle-orm';
import { Env } from "../types";
import { createDbClient } from "../db/client";
import { sessions, questions, Session, Question, NewSession, NewQuestion } from "../db/schema";
import { logAction } from "./action-logger";
import { generateText } from "../ai/providers/worker-ai";

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
  env: Env,
  endpointType: string,
  context?: string
): Promise<string> {
  try {
    const prompt = context
      ? `Generate a concise, descriptive 5-10 word title for a session of type "${endpointType}" with context: ${context}`
      : `Generate a concise, descriptive 5-10 word title for a session of type "${endpointType}"`;

    const title = await generateText(env, prompt);

    return title?.trim() || `${endpointType} session`;
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
  const db = createDbClient(env.DB);
  const sessionId = generateSessionId();

  // Generate title using AI if not provided
  const title = options.title || await generateSessionTitle(
    env,
    endpointType,
    options.titleContext || options.repoUrl
  );

  const newSession: NewSession = {
    sessionId,
    title,
    endpointType,
    repoUrl: options.repoUrl || null,
  };

  const result = await db.insert(sessions).values(newSession).returning({ id: sessions.id });
  const sessionDbId = result[0]?.id || 0;

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
  d1db: D1Database,
  sessionId: string
): Promise<Session | null> {
  const db = createDbClient(d1db);
  const result = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1);
  return result[0] || null;
}

/**
 * Get all sessions
 */
export async function getAllSessions(
  d1db: D1Database,
  limit: number = 100,
  offset: number = 0
): Promise<Session[]> {
  const db = createDbClient(d1db);
  const result = await db.select().from(sessions).orderBy(desc(sessions.timestamp)).limit(limit).offset(offset);
  return result;
}

/**
 * Add a question to a session
 */
export async function addQuestion(
  d1db: D1Database,
  sessionDbId: number,
  question: string,
  response: any,
  questionSource: 'user_provided' | 'ai_generated',
  metadata?: Record<string, any>
): Promise<number> {
  const db = createDbClient(d1db);

  const newQuestion: NewQuestion = {
    sessionId: sessionDbId,
    question,
    metaJson: metadata ? JSON.stringify(metadata) : null,
    response: JSON.stringify(response),
    questionSource,
  };

  const result = await db.insert(questions).values(newQuestion).returning({ id: questions.id });

  await logAction(d1db, "question_added", `Added question to session`, {
    sessionId: sessionDbId,
    metadata: { question_source: questionSource },
  });

  return result[0]?.id || 0;
}

/**
 * Get all questions for a session
 */
export async function getSessionQuestions(
  d1db: D1Database,
  sessionDbId: number
): Promise<Question[]> {
  const db = createDbClient(d1db);
  const result = await db.select().from(questions).where(eq(questions.sessionId, sessionDbId)).orderBy(questions.createdAt);
  return result;
}

/**
 * Update session's updated_at timestamp
 */
export async function updateSession(
  d1db: D1Database,
  sessionDbId: number
): Promise<void> {
  const db = createDbClient(d1db);
  await db.update(sessions).set({ updatedAt: new Date().toISOString() }).where(eq(sessions.id, sessionDbId));
}
