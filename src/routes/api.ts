import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  Env,
  SimpleQuestionsSchema,
  DetailedQuestionsSchema,
  SimpleResponseSchema,
  DetailedResponseSchema,
  AutoAnalyzeRepoSchema,
  AutoAnalyzeResponseSchema,
  PRAnalyzeSchema,
  PRAnalyzeResponseSchema,
  DetailedQuestion
} from "../types";
import { queryMCP } from "../utils/mcp-client";
import { rewriteQuestionForMCP, analyzeResponseAndGenerateFollowUps, analyzeCommentForCloudflare } from "../utils/worker-ai";
import { extractCodeSnippets, parsePRUrl, getPRComments, filterCommentsByAuthor } from "../utils/github";
import {
  parseRepoUrl,
  analyzeRepoAndGenerateQuestions,
  evaluateQuestionSufficiency
} from "../utils/repo-analyzer";
import { createSession, addQuestion, getAllSessions, getSession, getSessionQuestions } from "../utils/session-manager";
import { logAction, logError, getSessionActionLogs } from "../utils/action-logger";

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

/**
 * PR Analysis endpoint - analyzes PR comments for Cloudflare-related content
 */
const prAnalyzeRoute = createRoute({
  method: "post",
  path: "/questions/pr-analyze",
  operationId: "analyzePullRequest",
  tags: ["Questions"],
  summary: "Analyze GitHub Pull Request comments",
  description: "Extracts code comments from a GitHub PR (optionally filtered by author like 'gemini-code-assist'), analyzes them for Cloudflare-specific solutions using Worker AI, generates relevant questions, and queries Cloudflare documentation for answers",
  request: {
    body: {
      content: {
        "application/json": {
          schema: PRAnalyzeSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Successful PR analysis with generated questions and answers",
      content: {
        "application/json": {
          schema: PRAnalyzeResponseSchema,
        },
      },
    },
    400: {
      description: "Bad request - invalid PR URL",
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

app.openapi(prAnalyzeRoute, async (c) => {
  try {
    const { pr_url, comment_filter } = c.req.valid("json");
    const env = c.env;

    // Parse PR URL
    const parsed = parsePRUrl(pr_url);
    if (!parsed) {
      return c.json({ error: "Invalid GitHub Pull Request URL" }, 400);
    }

    const { owner, repo, prNumber } = parsed;

    // Create session for tracking
    const { sessionId, sessionDbId } = await createSession(env, 'pr-analyze', {
      repoUrl: pr_url,
      titleContext: `PR #${prNumber} - ${owner}/${repo}`,
    });

    await logAction(env.DB, "pr_analysis_started", `Analyzing PR #${prNumber}`, {
      sessionId: sessionDbId,
      metadata: { owner, repo, prNumber, comment_filter },
    });

    // Get all PR comments
    console.log(`Fetching comments from PR #${prNumber}...`);
    const allComments = await getPRComments(owner, repo, prNumber, env.GITHUB_TOKEN);

    // Filter comments if requested
    const comments = filterCommentsByAuthor(allComments, comment_filter);

    await logAction(env.DB, "comments_extracted", `Extracted ${comments.length} comments`, {
      sessionId: sessionDbId,
      metadata: { total_comments: allComments.length, filtered_comments: comments.length },
    });

    console.log(`Processing ${comments.length} comments...`);

    // Process each comment
    const results = await Promise.all(
      comments.map(async (comment) => {
        try {
          // Analyze if comment is Cloudflare-related
          const analysis = await analyzeCommentForCloudflare(env.AI, comment.body, {
            filePath: comment.file_path,
            line: comment.line,
          });

          if (!analysis.isCloudflareRelated) {
            return {
              comment: {
                id: comment.id,
                author: comment.author,
                body: comment.body,
                file_path: comment.file_path,
                line: comment.line,
              },
              is_cloudflare_related: false,
            };
          }

          // Generate questions and get answers
          const answers = await Promise.all(
            analysis.questions.map(async (question) => {
              try {
                // Rewrite question for MCP
                const rewrittenQuestion = await rewriteQuestionForMCP(env.AI, question);

                // Query MCP
                const context = `PR Comment Analysis - ${owner}/${repo} PR #${prNumber}`;
                const mcpResponse = await queryMCP(rewrittenQuestion, context, env.MCP_API_URL);

                // Store question in database
                await addQuestion(
                  env.DB,
                  sessionDbId,
                  question,
                  mcpResponse,
                  'ai_generated',
                  {
                    pr_number: prNumber,
                    comment_id: comment.id,
                    comment_author: comment.author,
                    cloudflare_context: analysis.cloudflareContext,
                  }
                );

                return {
                  original_question: question,
                  rewritten_question: rewrittenQuestion,
                  mcp_response: mcpResponse,
                };
              } catch (error) {
                console.error(`Error processing question "${question}":`, error);
                await logError(env.DB, "question_processing_error", error as Error, {
                  sessionId: sessionDbId,
                  metadata: { question },
                });
                return {
                  original_question: question,
                  error: error instanceof Error ? error.message : "Unknown error",
                };
              }
            })
          );

          await logAction(env.DB, "comment_analyzed", `Analyzed Cloudflare-related comment`, {
            sessionId: sessionDbId,
            metadata: {
              comment_id: comment.id,
              questions_generated: analysis.questions.length,
            },
          });

          return {
            comment: {
              id: comment.id,
              author: comment.author,
              body: comment.body,
              file_path: comment.file_path,
              line: comment.line,
            },
            is_cloudflare_related: true,
            cloudflare_context: analysis.cloudflareContext,
            questions_generated: analysis.questions,
            answers,
          };
        } catch (error) {
          console.error(`Error processing comment ${comment.id}:`, error);
          await logError(env.DB, "comment_analysis_error", error as Error, {
            sessionId: sessionDbId,
            metadata: { comment_id: comment.id },
          });
          return {
            comment: {
              id: comment.id,
              author: comment.author,
              body: comment.body,
              file_path: comment.file_path,
              line: comment.line,
            },
            is_cloudflare_related: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    const cloudflareRelatedCount = results.filter(r => r.is_cloudflare_related).length;

    await logAction(env.DB, "pr_analysis_completed", `Completed PR analysis`, {
      sessionId: sessionDbId,
      metadata: {
        total_comments: comments.length,
        cloudflare_related: cloudflareRelatedCount,
      },
    });

    return c.json({
      session_id: sessionId,
      pr_url,
      repo_owner: owner,
      repo_name: repo,
      pr_number: prNumber,
      comments_extracted: comments.length,
      cloudflare_related_comments: cloudflareRelatedCount,
      results,
      timestamp: new Date().toISOString(),
    }, 200);
  } catch (error) {
    console.error("Error in PR analyze route:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

/**
 * List all sessions endpoint
 */
const listSessionsRoute = createRoute({
  method: "get",
  path: "/sessions",
  operationId: "listSessions",
  tags: ["Sessions"],
  summary: "List all sessions",
  description: "Get a paginated list of all sessions",
  request: {
    query: z.object({
      limit: z.string().optional().default("100"),
      offset: z.string().optional().default("0"),
    }),
  },
  responses: {
    200: {
      description: "List of sessions",
      content: {
        "application/json": {
          schema: z.object({
            sessions: z.array(z.any()),
            total: z.number(),
            limit: z.number(),
            offset: z.number(),
          }),
        },
      },
    },
  },
});

app.openapi(listSessionsRoute, async (c) => {
  try {
    const { limit = "100", offset = "0" } = c.req.query();
    const sessions = await getAllSessions(
      c.env.DB,
      parseInt(limit, 10),
      parseInt(offset, 10)
    );

    return c.json({
      sessions,
      total: sessions.length,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
  } catch (error) {
    console.error("Error listing sessions:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

/**
 * Get session detail endpoint
 */
const getSessionRoute = createRoute({
  method: "get",
  path: "/sessions/:sessionId",
  operationId: "getSession",
  tags: ["Sessions"],
  summary: "Get session details",
  description: "Get detailed information about a specific session including all questions and responses",
  request: {
    params: z.object({
      sessionId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Session details",
      content: {
        "application/json": {
          schema: z.object({
            session: z.any(),
            questions: z.array(z.any()),
            action_logs: z.array(z.any()),
          }),
        },
      },
    },
    404: {
      description: "Session not found",
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

app.openapi(getSessionRoute, async (c) => {
  try {
    const { sessionId } = c.req.param();
    const session = await getSession(c.env.DB, sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const questions = await getSessionQuestions(c.env.DB, session.id);
    const actionLogs = await getSessionActionLogs(c.env.DB, session.id);

    return c.json({
      session,
      questions,
      action_logs: actionLogs,
    });
  } catch (error) {
    console.error("Error getting session:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

/**
 * Download session data as JSON endpoint
 */
const downloadSessionRoute = createRoute({
  method: "get",
  path: "/sessions/:sessionId/download",
  operationId: "downloadSession",
  tags: ["Sessions"],
  summary: "Download session data as JSON",
  description: "Download all session data including questions, responses, and metadata as a JSON file",
  request: {
    params: z.object({
      sessionId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Session data JSON",
      content: {
        "application/json": {
          schema: z.any(),
        },
      },
    },
    404: {
      description: "Session not found",
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

app.openapi(downloadSessionRoute, async (c) => {
  try {
    const { sessionId } = c.req.param();
    const session = await getSession(c.env.DB, sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const questions = await getSessionQuestions(c.env.DB, session.id);

    // Parse questions and responses
    const parsedQuestions = questions.map((q) => ({
      id: q.id,
      question: q.question,
      metadata: q.meta_json ? JSON.parse(q.meta_json) : null,
      response: JSON.parse(q.response),
      source: q.question_source,
      created_at: q.created_at,
    }));

    const downloadData = {
      session: {
        id: session.session_id,
        title: session.title,
        endpoint_type: session.endpoint_type,
        repo_url: session.repo_url,
        timestamp: session.timestamp,
      },
      questions: parsedQuestions,
      exported_at: new Date().toISOString(),
    };

    // Set headers for file download
    c.header("Content-Disposition", `attachment; filename="session-${sessionId}.json"`);
    return c.json(downloadData);
  } catch (error) {
    console.error("Error downloading session:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

export default app;
