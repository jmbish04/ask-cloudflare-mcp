import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  Env,
  SimpleQuestionsSchema,
  DetailedQuestionsSchema,
  SimpleResponseSchema,
  DetailedResponseSchema,
  AutoAnalyzeRepoSchema,
  AutoAnalyzeResponseSchema,
  DetailedQuestion
} from "../types";
import { queryMCP } from "../utils/mcp-client";
import { rewriteQuestionForMCP, analyzeResponseAndGenerateFollowUps } from "../utils/worker-ai";
import { extractCodeSnippets } from "../utils/github";
import {
  parseRepoUrl,
  analyzeRepoAndGenerateQuestions,
  evaluateQuestionSufficiency
} from "../utils/repo-analyzer";

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
              question.relevant_code_files,
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

/**
 * Auto-analyze repository endpoint - generates and processes questions automatically
 */
const autoAnalyzeRoute = createRoute({
  method: "post",
  path: "/questions/auto-analyze",
  operationId: "autoAnalyzeRepository",
  tags: ["Questions"],
  summary: "Auto-analyze GitHub repository",
  description: "Automatically analyze a GitHub repository, generate relevant questions, cache them in KV, and process through the detailed pathway. Always starts with the fundamental question: 'Can this repo be retrofitted to run on Cloudflare?'",
  request: {
    body: {
      content: {
        "application/json": {
          schema: AutoAnalyzeRepoSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Successful analysis with generated questions and answers",
      content: {
        "application/json": {
          schema: AutoAnalyzeResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request - invalid repo URL",
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

app.openapi(autoAnalyzeRoute, async (c) => {
  try {
    const { repo_url, force_refresh = false, max_files = 50 } = c.req.valid("json");
    const env = c.env;

    // Parse repo URL
    const parsed = parseRepoUrl(repo_url);
    if (!parsed) {
      return c.json({ error: "Invalid GitHub repository URL" }, 400);
    }

    const { owner, repo } = parsed;
    const cacheKey = `questions:${owner}:${repo}`;

    // Check cache first (unless force_refresh is true)
    let questions: DetailedQuestion[] = [];
    let cached = false;

    if (!force_refresh) {
      const cachedData = await env.QUESTIONS_KV.get(cacheKey, "json");
      if (cachedData && Array.isArray(cachedData)) {
        questions = cachedData as DetailedQuestion[];
        cached = true;
        console.log(`Using ${questions.length} cached questions for ${owner}/${repo}`);
      }
    }

    // Generate new questions if not cached or force refresh
    if (questions.length === 0) {
      console.log(`Analyzing repository ${owner}/${repo}...`);

      // Always start with the fundamental question
      const fundamentalQuestion: DetailedQuestion = {
        query: `Can the ${repo} repository be retrofitted to run on Cloudflare Workers or Cloudflare Pages?`,
        cloudflare_bindings_involved: ["env", "kv", "r2", "durable-objects", "ai"],
        node_libs_involved: [],
        tags: ["feasibility", "migration", "cloudflare", "assessment"],
        relevant_code_files: [],
      };

      // Generate additional questions using Worker AI
      const generatedQuestions = await analyzeRepoAndGenerateQuestions(
        env.AI,
        owner,
        repo,
        env.GITHUB_TOKEN,
        max_files
      );

      // If we had cached questions, evaluate if we should merge
      if (cached && questions.length > 0) {
        const evaluation = await evaluateQuestionSufficiency(
          env.AI,
          questions,
          [fundamentalQuestion, ...generatedQuestions]
        );

        questions = evaluation.recommendedQuestions;
        console.log(`Merged questions: ${evaluation.reasoning}`);
      } else {
        // Use fundamental question + generated questions
        questions = [fundamentalQuestion, ...generatedQuestions];
      }

      // Cache the questions for future use
      await env.QUESTIONS_KV.put(cacheKey, JSON.stringify(questions), {
        expirationTtl: 86400 * 7, // Cache for 7 days
      });

      console.log(`Generated and cached ${questions.length} questions`);
    }

    // Process questions through the detailed pathway
    console.log(`Processing ${questions.length} questions...`);

    const results = await Promise.all(
      questions.map(async (question) => {
        try {
          // Extract code snippets if files are specified
          let codeSnippets: any[] = [];
          if (question.relevant_code_files.length > 0) {
            codeSnippets = await extractCodeSnippets(
              owner,
              repo,
              question.relevant_code_files as any,
              env.GITHUB_TOKEN
            );
          }

          // Rewrite question with full context
          const rewrittenQuestion = await rewriteQuestionForMCP(env.AI, question.query, {
            bindings: question.cloudflare_bindings_involved,
            libraries: question.node_libs_involved,
            tags: question.tags,
            codeSnippets,
          });

          // Query MCP with context
          const context = `Repository Analysis: ${owner}/${repo} - Cloudflare Migration Assessment`;
          const mcpResponse = await queryMCP(rewrittenQuestion, context, env.MCP_API_URL);

          // Analyze and generate follow-ups
          const { analysis, followUpQuestions } = await analyzeResponseAndGenerateFollowUps(
            env.AI,
            question.query,
            mcpResponse
          );

          // Process follow-up questions
          let followUpAnswers: any[] = [];
          if (followUpQuestions.length > 0) {
            followUpAnswers = await Promise.all(
              followUpQuestions.slice(0, 3).map((fq) => queryMCP(fq, context, env.MCP_API_URL))
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
          console.error(`Error processing question "${question.query}":`, error);
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
      repo_url,
      repo_owner: owner,
      repo_name: repo,
      cached,
      questions_generated: questions.length,
      questions,
      results,
      total_processed: questions.length,
      timestamp: new Date().toISOString(),
    }, 200);
  } catch (error) {
    console.error("Error in auto-analyze route:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

export default app;
