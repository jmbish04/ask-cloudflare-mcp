import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Sessions table - tracks each request session
 */
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull().unique(),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`).notNull(),
  title: text('title'),
  endpointType: text('endpoint_type', {
    enum: ['simple-questions', 'detailed-questions', 'auto-analyze', 'pr-analyze']
  }).notNull(),
  repoUrl: text('repo_url'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Questions table - stores individual questions and responses
 */
export const questions = sqliteTable('questions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  metaJson: text('meta_json'),
  response: text('response').notNull(),
  questionSource: text('question_source', {
    enum: ['user_provided', 'ai_generated']
  }).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Action logs table - comprehensive logging for all actions
 */
export const actionLogs = sqliteTable('action_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').references(() => sessions.id, { onDelete: 'set null' }),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`).notNull(),
  actionType: text('action_type').notNull(),
  actionDescription: text('action_description').notNull(),
  metadataJson: text('metadata_json'),
  hasError: integer('has_error', { mode: 'boolean' }).default(false).notNull(),
  errorMessage: text('error_message'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

/**
 * Health checks table - tracks periodic system health checks
 */
export const healthChecks = sqliteTable('health_checks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`).notNull(),
  checkType: text('check_type').notNull(), // 'cron-nightly', 'cron-weekly', 'manual'
  status: text('status').notNull(), // 'success', 'failure'
  durationMs: integer('duration_ms').notNull(),
  stepsJson: text('steps_json').notNull(), // JSON array of steps taken and results
  triggerSource: text('trigger_source'), // 'cron', 'api', 'websocket'
  aiAnalysis: text('ai_analysis'), // Legacy text analysis (keep for backward compatibility if needed, or deprecate)
  aiAnalysisJson: text('ai_analysis_json'), // Structured JSON analysis
  error: text('error'),
});

/**
 * Chats table - stores individual chat messages for analytics
 */
export const chats = sqliteTable('chats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: text('agent_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`).notNull(),
  metadataJson: text('metadata_json')
});

/**
 * Knowledge Base table - stores ingested content
 */
export const knowledgeBase = sqliteTable('knowledge_base', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull().unique(),
  title: text('title'),
  content: text('content').notNull(), // Cleaned text content
  description: text('description'),
  tags: text('tags'), // JSON array of tags
  metadataJson: text('metadata_json'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Type exports for use in the application
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;

export type ActionLog = typeof actionLogs.$inferSelect;
export type NewActionLog = typeof actionLogs.$inferInsert;

export type HealthCheck = typeof healthChecks.$inferSelect;
export type NewHealthCheck = typeof healthChecks.$inferInsert;

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;

export type KnowledgeBaseItem = typeof knowledgeBase.$inferSelect;
export type NewKnowledgeBaseItem = typeof knowledgeBase.$inferInsert;
