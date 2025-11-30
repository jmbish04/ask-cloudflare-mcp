import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Env, SimpleQuestionsSchema, DetailedQuestionsSchema, SimpleResponseSchema, DetailedResponseSchema } from "../types";
import { queryMCP } from "../utils/mcp-client";
import { rewriteQuestionForMCP, analyzeResponseAndGenerateFollowUps } from "../utils/worker-ai";
import { extractCodeSnippets } from "../utils/github";

const app = new OpenAPIHono<{ Bindings: Env }>();

/**
 * Simple questions endpoint - receives array of questions
 */
const simpleQuestionsRoute = createRoute({
  method: "post",
  path: "/questions/simple",
  operationId: "processSimpleQuestions",
  tags: ["Questions"],
  summary: "Process simple array of questions",
  description: "Receives an array of questions, queries Cloudflare docs MCP, analyzes with Worker AI, and returns answers",
  request: {
    body: {
      content: {
        "application/json": {
          schema: SimpleQuestionsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Successful response with answers",
      content: {
        "application/json": {
          schema: SimpleResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

app.openapi(simpleQuestionsRoute, async (c) => {
  try {
    const { questions } = c.req.valid("json");
    const env = c.env;

    const results = await Promise.all(
      questions.map(async (question) => {
        try {
          // Step 1: Rewrite question with AI
          const rewrittenQuestion = await rewriteQuestionForMCP(env.AI, question);

          // Step 2: Query MCP
          const mcpResponse = await queryMCP(rewrittenQuestion, undefined, env.MCP_API_URL);

          // Step 3: Analyze and generate follow-ups
          const { analysis, followUpQuestions } = await analyzeResponseAndGenerateFollowUps(
            env.AI,
            question,
            mcpResponse
          );

          // Step 4: Process follow-up questions if any
          let followUpAnswers: any[] = [];
          if (followUpQuestions.length > 0) {
            followUpAnswers = await Promise.all(
              followUpQuestions.map((fq) => queryMCP(fq, undefined, env.MCP_API_URL))
            );
          }

          return {
            original_question: question,
            rewritten_question: rewrittenQuestion,
            mcp_response: mcpResponse,
            follow_up_questions: followUpQuestions,
            follow_up_answers: followUpAnswers,
            ai_analysis: analysis,
          };
        } catch (error) {
          console.error(`Error processing question "${question}":`, error);
          return {
            original_question: question,
            rewritten_question: undefined,
            mcp_response: { error: error instanceof Error ? error.message : "Unknown error" },
            follow_up_questions: [],
            follow_up_answers: [],
            ai_analysis: undefined,
          };
        }
      })
    );

    return c.json({
      results,
      total_processed: questions.length,
      timestamp: new Date().toISOString(),
    }, 200);
  } catch (error) {
    console.error("Error in simple questions route:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

/**
 * Detailed questions endpoint - replicates Python script functionality
 */
const detailedQuestionsRoute = createRoute({
  method: "post",
  path: "/questions/detailed",
  operationId: "processDetailedQuestions",
  tags: ["Questions"],
  summary: "Process detailed questions with code context",
  description: "Receives detailed questions with code context, fetches code from GitHub, queries MCP with full context",
  request: {
    body: {
      content: {
        "application/json": {
          schema: DetailedQuestionsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Successful response with detailed answers",
      content: {
        "application/json": {
          schema: DetailedResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

app.openapi(detailedQuestionsRoute, async (c) => {
  try {
    const { questions, repo_owner, repo_name } = c.req.valid("json");
    const env = c.env;

    const results = await Promise.all(
      questions.map(async (question) => {
        try {
          // Step 1: Extract code snippets if GitHub repo provided
          let codeSnippets: any[] = [];
          if (repo_owner && repo_name && question.relevant_code_files.length > 0) {
            codeSnippets = await extractCodeSnippets(
              repo_owner,
              repo_name,
              question.relevant_code_files as any,
              env.GITHUB_TOKEN
            );
          }

          // Step 2: Rewrite question with full context
          const rewrittenQuestion = await rewriteQuestionForMCP(env.AI, question.query, {
            bindings: question.cloudflare_bindings_involved,
            libraries: question.node_libs_involved,
            tags: question.tags,
            codeSnippets,
          });

          // Step 3: Query MCP with context
          const context = `Cloudflare Migration Context - Bindings: ${question.cloudflare_bindings_involved.join(", ")}`;
          const mcpResponse = await queryMCP(rewrittenQuestion, context, env.MCP_API_URL);

          // Step 4: Analyze and generate follow-ups
          const { analysis, followUpQuestions } = await analyzeResponseAndGenerateFollowUps(
            env.AI,
            question.query,
            mcpResponse
          );

          // Step 5: Process follow-up questions
          let followUpAnswers: any[] = [];
          if (followUpQuestions.length > 0) {
            followUpAnswers = await Promise.all(
              followUpQuestions.map((fq) => queryMCP(fq, context, env.MCP_API_URL))
            );
          }

          return {
            original_question: question,
            code_snippets: codeSnippets,
            rewritten_question: rewrittenQuestion,
            mcp_response: mcpResponse,
            follow_up_questions: followUpQuestions,
            follow_up_answers: followUpAnswers,
            ai_analysis: analysis,
          };
        } catch (error) {
          console.error(`Error processing detailed question "${question.query}":`, error);
          return {
            original_question: question,
            code_snippets: [],
            rewritten_question: undefined,
            mcp_response: { error: error instanceof Error ? error.message : "Unknown error" },
            follow_up_questions: [],
            follow_up_answers: [],
            ai_analysis: undefined,
          };
        }
      })
    );

    return c.json({
      results,
      total_processed: questions.length,
      timestamp: new Date().toISOString(),
    }, 200);
  } catch (error) {
    console.error("Error in detailed questions route:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

/**
 * Health check endpoint
 */
const healthRoute = createRoute({
  method: "get",
  path: "/health",
  operationId: "healthCheck",
  tags: ["System"],
  summary: "Health check",
  description: "Check if the service is running",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string(),
            timestamp: z.string(),
          }),
        },
      },
    },
  },
});

app.openapi(healthRoute, async (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export default app;
