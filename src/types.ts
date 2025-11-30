import { z } from "zod";

// Environment bindings
export interface Env {
  AI: Ai;
  GITHUB_TOKEN: string;
  MCP_API_URL: string;
  ASSETS: Fetcher;
  QUESTIONS_KV: KVNamespace;
  DB: D1Database;
  // Gemini secrets
  CF_AIG_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  WORKER_URL?: string;
}

// Question schema for simple pathway
export const SimpleQuestionSchema = z.object({
  query: z.string().describe("The question to ask"),
});

export const SimpleQuestionsSchema = z.object({
  questions: z.array(z.string()).describe("Array of questions to process"),
  use_gemini: z.boolean().optional().default(false).describe("Use Google Gemini via Cloudflare AI Gateway instead of Workers AI"),
});

// Detailed question schema for Python script replication
export const DetailedQuestionSchema = z.object({
  query: z.string().describe("The main question"),
  cloudflare_bindings_involved: z.array(z.string()).describe("Cloudflare bindings used"),
  node_libs_involved: z.array(z.string()).describe("Node.js libraries involved"),
  tags: z.array(z.string()).describe("Relevant tags"),
  relevant_code_files: z.array(
    z.object({
      file_path: z.string().describe("Path to the file"),
      start_line: z.number().describe("Starting line number"),
      end_line: z.number().describe("Ending line number"),
      relation_to_question: z.string().describe("How this file relates to the question"),
    })
  ).describe("Code files relevant to the question"),
});

export const DetailedQuestionsSchema = z.object({
  questions: z.array(DetailedQuestionSchema).describe("Array of detailed questions"),
  repo_owner: z.string().optional().describe("GitHub repository owner"),
  repo_name: z.string().optional().describe("GitHub repository name"),
  use_gemini: z.boolean().optional().default(false).describe("Use Google Gemini via Cloudflare AI Gateway instead of Workers AI"),
});

// Response schemas
export const AnswerSchema = z.object({
  original_question: z.string(),
  rewritten_question: z.string().optional(),
  mcp_response: z.any(),
  follow_up_questions: z.array(z.string()).optional(),
  follow_up_answers: z.array(z.any()).optional(),
  ai_analysis: z.string().optional(),
});

export const SimpleResponseSchema = z.object({
  results: z.array(AnswerSchema),
  total_processed: z.number(),
  timestamp: z.string(),
});

export const DetailedResponseSchema = z.object({
  results: z.array(
    z.object({
      original_question: DetailedQuestionSchema,
      code_snippets: z.array(
        z.object({
          file_path: z.string(),
          code: z.string(),
          relation: z.string(),
        })
      ).optional(),
      rewritten_question: z.string().optional(),
      mcp_response: z.any(),
      follow_up_questions: z.array(z.string()).optional(),
      follow_up_answers: z.array(z.any()).optional(),
      ai_analysis: z.string().optional(),
    })
  ),
  total_processed: z.number(),
  timestamp: z.string(),
});

// MCP Server types
export interface MCPRequest {
  jsonrpc: "2.0";
  method: string;
  params?: any;
  id?: string | number;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number;
}

export interface MCPToolCallParams {
  query: string;
  context?: string;
}

// WebSocket message types
export interface WSMessage {
  type: "question" | "answer" | "error" | "status";
  data: any;
  timestamp?: string;
}

// Auto-analyze repository schema
export const AutoAnalyzeRepoSchema = z.object({
  repo_url: z.string().describe("GitHub repository URL (e.g., https://github.com/owner/repo)"),
  force_refresh: z.boolean().optional().describe("Force regeneration of questions, ignoring cache"),
  max_files: z.number().optional().describe("Maximum number of files to analyze (default: 50)"),
  use_gemini: z.boolean().optional().default(false).describe("Use Google Gemini (gemini-2.5-flash) via Cloudflare AI Gateway instead of Workers AI"),
});

export const AutoAnalyzeResponseSchema = z.object({
  repo_url: z.string(),
  repo_owner: z.string(),
  repo_name: z.string(),
  cached: z.boolean(),
  questions_generated: z.number(),
  questions: z.array(DetailedQuestionSchema),
  results: z.array(
    z.object({
      original_question: DetailedQuestionSchema,
      code_snippets: z.array(
        z.object({
          file_path: z.string(),
          code: z.string(),
          relation: z.string(),
        })
      ).optional(),
      rewritten_question: z.string().optional(),
      mcp_response: z.any(),
      follow_up_questions: z.array(z.string()).optional(),
      follow_up_answers: z.array(z.any()).optional(),
      ai_analysis: z.string().optional(),
    })
  ),
  total_processed: z.number(),
  timestamp: z.string(),
});

// PR Analysis schema
export const PRAnalyzeSchema = z.object({
  pr_url: z.string().describe("GitHub Pull Request URL (e.g., https://github.com/owner/repo/pull/123)"),
  comment_filter: z.string().optional().describe("Filter comments by author (e.g., 'gemini-code-assist', 'copilot')"),
  use_gemini: z.boolean().optional().default(false).describe("Use Google Gemini via Cloudflare AI Gateway instead of Workers AI"),
});

export const PRAnalyzeResponseSchema = z.object({
  session_id: z.string(),
  pr_url: z.string(),
  repo_owner: z.string(),
  repo_name: z.string(),
  pr_number: z.number(),
  comments_extracted: z.number(),
  cloudflare_related_comments: z.number(),
  results: z.array(
    z.object({
      comment: z.object({
        id: z.number(),
        author: z.string(),
        body: z.string(),
        file_path: z.string().optional(),
        line: z.number().optional(),
      }),
      is_cloudflare_related: z.boolean(),
      cloudflare_context: z.string().optional(),
      questions_generated: z.array(z.string()).optional(),
      answers: z.array(z.any()).optional(),
    })
  ),
  timestamp: z.string(),
});

// Database record types
export interface SessionRecord {
  id: number;
  session_id: string;
  timestamp: string;
  title: string | null;
  endpoint_type: 'simple-questions' | 'detailed-questions' | 'auto-analyze' | 'pr-analyze';
  repo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionRecord {
  id: number;
  session_id: number;
  question: string;
  meta_json: string | null;
  response: string;
  question_source: 'user_provided' | 'ai_generated';
  created_at: string;
}

export interface ActionLogRecord {
  id: number;
  session_id: number | null;
  timestamp: string;
  action_type: string;
  action_description: string;
  metadata_json: string | null;
  has_error: number;
  error_message: string | null;
  created_at: string;
}

// Types for the response
export type SimpleQuestion = z.infer<typeof SimpleQuestionSchema>;
export type SimpleQuestions = z.infer<typeof SimpleQuestionsSchema>;
export type DetailedQuestion = z.infer<typeof DetailedQuestionSchema>;
export type DetailedQuestions = z.infer<typeof DetailedQuestionsSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type SimpleResponse = z.infer<typeof SimpleResponseSchema>;
export type DetailedResponse = z.infer<typeof DetailedResponseSchema>;
export type AutoAnalyzeRepo = z.infer<typeof AutoAnalyzeRepoSchema>;
export type AutoAnalyzeResponse = z.infer<typeof AutoAnalyzeResponseSchema>;
export type PRAnalyze = z.infer<typeof PRAnalyzeSchema>;
export type PRAnalyzeResponse = z.infer<typeof PRAnalyzeResponseSchema>;
