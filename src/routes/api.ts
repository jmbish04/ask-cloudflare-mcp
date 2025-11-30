import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamText } from "hono/streaming";
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
import { rewriteQuestionForMCP as rewriteWorker, analyzeResponseAndGenerateFollowUps as analyzeWorker } from "../utils/worker-ai";
import { rewriteQuestionForMCP as rewriteGemini, analyzeResponseAndGenerateFollowUps as analyzeGemini } from "../utils/gemini";
import { extractCodeSnippets } from "../utils/github";
import {
  parseRepoUrl,
  analyzeRepoAndGenerateQuestions
} from "../utils/repo-analyzer";

const app = new OpenAPIHono<{ Bindings: Env }>();

// Helper to select provider
const getProvider = (useGemini: boolean, env: any) => {
  if (useGemini) {
    if (!env.CF_AIG_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error("Gemini requested but CF_AIG_TOKEN or CLOUDFLARE_ACCOUNT_ID not set");
    }
    return {
      rewrite: (q: string, ctx?: any) => rewriteGemini(env, q, ctx),
      analyze: (q: string, resp: any) => analyzeGemini(env, q, resp)
    };
  }
  return {
    rewrite: (q: string, ctx?: any) => rewriteWorker(env.AI, q, ctx),
    analyze: (q: string, resp: any) => analyzeWorker(env.AI, q, resp)
  };
};

/**
 * Simple questions endpoint
 */
const simpleQuestionsRoute = createRoute({
  method: "post",
  path: "/questions/simple",
  operationId: "processSimpleQuestions",
  tags: ["Questions"],
  summary: "Process simple array of questions",
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
      description: "Successful response",
      content: { "application/json": { schema: SimpleResponseSchema } },
    },
    400: { description: "Bad request", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
    500: { description: "Server Error", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
  },
});

app.openapi(simpleQuestionsRoute, async (c) => {
  try {
    const { questions } = c.req.valid("json");
    // Default to Worker AI for simple endpoint unless we add a query param later
    const provider = getProvider(false, c.env); 

    const results = await Promise.all(
      questions.map(async (question) => {
        try {
          const rewrittenQuestion = await provider.rewrite(question);
          const mcpResponse = await queryMCP(rewrittenQuestion, undefined, c.env.MCP_API_URL);
          const { analysis, followUpQuestions } = await provider.analyze(question, mcpResponse);

          let followUpAnswers: any[] = [];
          if (followUpQuestions.length > 0) {
            followUpAnswers = await Promise.all(
              followUpQuestions.map((fq) => queryMCP(fq, undefined, c.env.MCP_API_URL))
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
          return {
            original_question: question,
            mcp_response: { error: error instanceof Error ? error.message : "Unknown error" },
          };
        }
      })
    );

    return c.json({ results, total_processed: questions.length, timestamp: new Date().toISOString() }, 200);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

/**
 * Detailed questions endpoint
 */
const detailedQuestionsRoute = createRoute({
  method: "post",
  path: "/questions/detailed",
  operationId: "processDetailedQuestions",
  tags: ["Questions"],
  summary: "Process detailed questions",
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
    200: { description: "Success", content: { "application/json": { schema: DetailedResponseSchema } } },
    400: { description: "Bad Request", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
    500: { description: "Server Error", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
  },
});

app.openapi(detailedQuestionsRoute, async (c) => {
  try {
    const { questions, repo_owner, repo_name } = c.req.valid("json");
    const provider = getProvider(false, c.env); // Default to Worker AI

    const results = await Promise.all(
      questions.map(async (question) => {
        try {
          let codeSnippets: any[] = [];
          if (repo_owner && repo_name && question.relevant_code_files.length > 0) {
            codeSnippets = await extractCodeSnippets(
              repo_owner,
              repo_name,
              question.relevant_code_files,
              c.env.GITHUB_TOKEN
            );
          }

          const rewrittenQuestion = await provider.rewrite(question.query, {
            bindings: question.cloudflare_bindings_involved,
            libraries: question.node_libs_involved,
            tags: question.tags,
            codeSnippets,
          });

          const context = `Cloudflare Migration Context - Bindings: ${question.cloudflare_bindings_involved.join(", ")}`;
          const mcpResponse = await queryMCP(rewrittenQuestion, context, c.env.MCP_API_URL);
          const { analysis, followUpQuestions } = await provider.analyze(question.query, mcpResponse);

          let followUpAnswers: any[] = [];
          if (followUpQuestions.length > 0) {
            followUpAnswers = await Promise.all(
              followUpQuestions.map((fq) => queryMCP(fq, context, c.env.MCP_API_URL))
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
          return {
            original_question: question,
            code_snippets: [],
            mcp_response: { error: error instanceof Error ? error.message : "Unknown error" },
          };
        }
      })
    );

    return c.json({ results, total_processed: questions.length, timestamp: new Date().toISOString() }, 200);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

/**
 * Auto-analyze repository endpoint
 */
const autoAnalyzeRoute = createRoute({
  method: "post",
  path: "/questions/auto-analyze",
  operationId: "autoAnalyzeRepository",
  tags: ["Questions"],
  summary: "Auto-analyze GitHub repository",
  description: "Analyze GitHub repository. Supports ?stream=true. Use `use_gemini: true` in body to use Google Gemini.",
  request: {
    query: z.object({
      stream: z.string().optional(),
    }),
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
      description: "Successful response",
      content: {
        "application/json": { schema: AutoAnalyzeResponseSchema },
        "text/plain": { schema: z.string() }
      },
    },
    400: { description: "Bad request", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
    500: { description: "Server Error", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
  },
});

app.openapi(autoAnalyzeRoute, async (c) => {
  try {
    const { repo_url, force_refresh = false, max_files = 50, use_gemini = false } = c.req.valid("json");
    const streamMode = c.req.query("stream") === "true";
    const env = c.env;

    const parsed = parseRepoUrl(repo_url);
    if (!parsed) {
      return c.json({ error: "Invalid GitHub repository URL" }, 400);
    }
    const { owner, repo } = parsed;
    const cacheKey = `questions:${owner}:${repo}`;

    // Select Provider
    const provider = getProvider(use_gemini, env);

    if (streamMode) {
      return streamText(c, async (stream) => {
        const log = async (msg: string) => await stream.write(msg + "\n");
        await log(`🚀 Starting analysis for ${owner}/${repo}...`);
        await log(`🤖 Using AI Provider: ${use_gemini ? "Google Gemini 2.5 Flash" : "Cloudflare Workers AI"}`);

        let questions: DetailedQuestion[] = [];
        let cached = false;

        if (!force_refresh) {
          await log(`🔍 Checking cache...`);
          const cachedData = await env.QUESTIONS_KV.get(cacheKey, "json");
          if (cachedData && Array.isArray(cachedData)) {
            questions = cachedData as DetailedQuestion[];
            cached = true;
            await log(`✅ Found ${questions.length} cached questions.`);
          }
        }

        if (questions.length === 0) {
          await log(`🧠 Cache miss. Analyzing repository structure and docs...`);
          await log(`   (This may take 10-20 seconds...)`);
          
          // Pass use_gemini flag to repo analyzer
          const generatedQuestions = await analyzeRepoAndGenerateQuestions(
            env, // Pass full env to support Gemini
            owner,
            repo,
            env.GITHUB_TOKEN,
            max_files,
            use_gemini // Pass the flag
          );
          
          const fundamentalQuestion: DetailedQuestion = {
            query: `Can the ${repo} repository be retrofitted to run on Cloudflare Workers?`,
            cloudflare_bindings_involved: ["env", "kv", "r2", "durable-objects"],
            node_libs_involved: [],
            tags: ["feasibility", "migration"],
            relevant_code_files: [],
          };

          questions = [fundamentalQuestion, ...generatedQuestions];
          await log(`✨ Generated ${questions.length} migration questions.`);
          await env.QUESTIONS_KV.put(cacheKey, JSON.stringify(questions), { expirationTtl: 86400 * 7 });
        }

        await log(`\n⚡ Processing ${questions.length} questions against Cloudflare Docs...`);
        
        for (const [index, question] of questions.entries()) {
          await log(`   [${index + 1}/${questions.length}] Asking: "${question.query}"...`);
          try {
            const rewritten = await provider.rewrite(question.query, {
              bindings: question.cloudflare_bindings_involved,
              libraries: question.node_libs_involved,
              tags: question.tags
            });

            const mcpRes = await queryMCP(rewritten, undefined, env.MCP_API_URL);
            const { analysis } = await provider.analyze(question.query, mcpRes);

            await log(`      -> ✅ Analysis complete.`);
          } catch (err) {
            await log(`      -> ❌ Error: ${err instanceof Error ? err.message : "Unknown"}`);
          }
        }
        await log(`\n🎉 Analysis Complete!`);
      });
    }

    // --- Standard JSON Logic (Non-Streaming) ---
    // (Simplified for brevity - duplicates streaming logic structure but returns JSON)
    let questions: DetailedQuestion[] = [];
    if (!force_refresh) {
      const cachedData = await env.QUESTIONS_KV.get(cacheKey, "json");
      if (cachedData && Array.isArray(cachedData)) questions = cachedData as DetailedQuestion[];
    }

    if (questions.length === 0) {
      const generatedQuestions = await analyzeRepoAndGenerateQuestions(
        env,
        owner,
        repo,
        env.GITHUB_TOKEN,
        max_files,
        use_gemini
      );
      const fundamentalQuestion: DetailedQuestion = {
        query: `Can the ${repo} repository be retrofitted to run on Cloudflare Workers?`,
        cloudflare_bindings_involved: ["env", "kv", "r2", "durable-objects"],
        node_libs_involved: [],
        tags: ["feasibility", "migration"],
        relevant_code_files: [],
      };
      questions = [fundamentalQuestion, ...generatedQuestions];
      await env.QUESTIONS_KV.put(cacheKey, JSON.stringify(questions), { expirationTtl: 86400 * 7 });
    }

    const results = await Promise.all(
      questions.map(async (question) => {
        try {
          const rewritten = await provider.rewrite(question.query, {
            bindings: question.cloudflare_bindings_involved,
            libraries: question.node_libs_involved,
            tags: question.tags
          });
          const mcpRes = await queryMCP(rewritten, undefined, env.MCP_API_URL);
          const { analysis, followUpQuestions } = await provider.analyze(question.query, mcpRes);
          return {
            original_question: question,
            rewritten_question: rewritten,
            mcp_response: mcpRes,
            follow_up_questions: followUpQuestions,
            ai_analysis: analysis
          };
        } catch (error) {
          return { original_question: question, mcp_response: { error: "Failed" } };
        }
      })
    );

    return c.json({
      repo_url,
      repo_owner: owner,
      repo_name: repo,
      cached: false, // simplified
      questions_generated: questions.length,
      questions,
      results,
      total_processed: questions.length,
      timestamp: new Date().toISOString(),
    }, 200);

  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
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
  responses: {
    200: { description: "Service is healthy", content: { "application/json": { schema: z.object({ status: z.string(), timestamp: z.string() }) } } },
  },
});

app.openapi(healthRoute, async (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
