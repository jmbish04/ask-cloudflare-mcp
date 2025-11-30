import { Env, DetailedQuestion } from "../types";
import { queryWorkerAIStructured } from "./worker-ai";
import { getRepoStructure, fetchGitHubFile } from "./github";

/**
 * Parse GitHub repository URL
 */
export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    // Handle various GitHub URL formats
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/\.]+)/,  // https://github.com/owner/repo
      /github\.com\/([^\/]+)\/([^\/]+)\.git/, // https://github.com/owner/repo.git
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, ""),
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get repository file tree
 */
export async function getRepoFileTree(
  owner: string,
  repo: string,
  token: string,
  path: string = "",
  maxDepth: number = 3,
  currentDepth: number = 0
): Promise<Array<{ path: string; type: string; size?: number }>> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  const contents = await getRepoStructure(owner, repo, token, path);
  const files: Array<{ path: string; type: string; size?: number }> = [];

  if (!Array.isArray(contents)) {
    return [];
  }

  for (const item of contents) {
    if (item.type === "file") {
      files.push({
        path: item.path,
        type: item.type,
        size: item.size,
      });
    } else if (item.type === "dir") {
      // Recursively get files from subdirectories
      const subFiles = await getRepoFileTree(
        owner,
        repo,
        token,
        item.path,
        maxDepth,
        currentDepth + 1
      );
      files.push(...subFiles);
    }
  }

  return files;
}

/**
 * Filter relevant files for analysis (skip common files like node_modules, etc.)
 */
export function filterRelevantFiles(
  files: Array<{ path: string; type: string; size?: number }>,
  maxFiles: number = 50
): Array<{ path: string; type: string; size?: number }> {
  const ignorePaths = [
    "node_modules/",
    ".git/",
    "dist/",
    "build/",
    "coverage/",
    ".next/",
    ".nuxt/",
    "vendor/",
    "public/assets/",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
  ];

  const relevantExtensions = [
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".php",
    ".rb",
    ".vue",
    ".svelte",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".config.js",
    ".config.ts",
    "Dockerfile",
    "Procfile"
  ];

  const filtered = files.filter((file) => {
    // Skip ignored paths
    if (ignorePaths.some((ignore) => file.path.includes(ignore))) {
      return false;
    }

    // Include files with relevant extensions or config files
    return (
      relevantExtensions.some((ext) => file.path.endsWith(ext)) ||
      file.path.includes("config") ||
      file.path.includes("webpack") ||
      file.path.includes("vite") ||
      file.path.includes("wrangler")
    );
  });

  // Sort by relevance (config files first, then by path)
  filtered.sort((a, b) => {
    const aIsConfig =
      a.path.includes("config") ||
      a.path.includes("wrangler") ||
      a.path.includes("package.json");
    const bIsConfig =
      b.path.includes("config") ||
      b.path.includes("wrangler") ||
      b.path.includes("package.json");

    if (aIsConfig && !bIsConfig) return -1;
    if (!aIsConfig && bIsConfig) return 1;
    return a.path.localeCompare(b.path);
  });

  return filtered.slice(0, maxFiles);
}

/**
 * Analyze repository and generate questions using Worker AI (Smart Stack Detection)
 * Uses GPT-OSS-120B for reasoning and Llama-3.3-70B for structuring.
 */
export async function analyzeRepoAndGenerateQuestions(
  ai: Ai,
  owner: string,
  repo: string,
  token: string,
  maxFiles: number = 50
): Promise<DetailedQuestion[]> {
  // 1. Fetch File Tree & Filter
  const allFiles = await getRepoFileTree(owner, repo, token);
  const relevantFiles = filterRelevantFiles(allFiles, maxFiles);

  // 2. Read File Contents (Focus on infrastructure files with larger chunk size)
  const fileContents = await Promise.all(
    relevantFiles.slice(0, 15).map(async (file) => {
      try {
        const content = await fetchGitHubFile(owner, repo, file.path, token);
        return {
          path: file.path,
          content: content.substring(0, 8000), // Larger chunk for better context
        };
      } catch {
        return null;
      }
    })
  );

  const validFiles = fileContents.filter((f) => f !== null);

  // 3. Construct "Stack Aware" Prompt for GPT-OSS-120B
  const analysisPrompt = `You are a Senior Cloud Architect specializing in migrating legacy applications to Cloudflare's Edge (Workers, Pages, D1, R2, Queues).

  Analyze the provided codebase to identify the exact technology stack.
  
  REPO: ${owner}/${repo}
  
  FILES PROVIDED:
  ${validFiles.map((f) => `\n=== ${f!.path} ===\n${f!.content.substring(0, 1500)}...`).join("\n")}

  YOUR TASK:
  1. Identify the Core Stack:
     - Frontend (React, Vue, Next.js, Plain HTML?)
     - Backend (Node.js, Express, Python/Django, Go?)
     - Database (Postgres, MySQL, MongoDB, Redis?)
     - State/Caching (Redux, Redis, Memcached?)
  
  2. Generate specific, intelligent migration questions mapping THIS stack to Cloudflare equivalents.
     - DO NOT ask "Can X be retrofitted?".
     - DO ask "How do I migrate [Specific Tech] to [Specific Cloudflare Product]?".
     - If Postgres is found -> Ask about migrating to Cloudflare D1 or Hyperdrive.
     - If Redis is found -> Ask about Cloudflare KV or Durable Objects.
     - If Express is found -> Ask about porting Express to Workers or Hono.
     - If React is found -> Ask about deploying SPA to Cloudflare Pages.
     - If a Database ORM (Prisma, Drizzle, Mongoose) is found -> Ask about compatibility with Workers.

  3. Return a list of 3-5 highly relevant, deeply technical questions.
  `;

  // 4. Schema for Llama-3.3 to enforce
  const schema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            query: { 
              type: "string",
              description: "The specific technical question for Cloudflare docs"
            },
            cloudflare_bindings_involved: { 
              type: "array", 
              items: { type: "string" },
              description: "Predicted bindings (e.g., 'd1', 'hyperdrive', 'kv', 'pages', 'workers')"
            },
            node_libs_involved: { 
              type: "array", 
              items: { type: "string" },
              description: "Libraries from the original repo that are relevant (e.g., 'express', 'mongoose')"
            },
            tags: { 
              type: "array", 
              items: { type: "string" } 
            },
            relevant_code_files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  file_path: { type: "string" },
                  start_line: { type: "integer" },
                  end_line: { type: "integer" },
                  relation_to_question: { type: "string" }
                },
                required: ["file_path", "start_line", "end_line", "relation_to_question"],
                additionalProperties: false
              }
            }
          },
          required: ["query", "cloudflare_bindings_involved", "node_libs_involved", "tags", "relevant_code_files"],
          additionalProperties: false
        }
      }
    },
    required: ["questions"],
    additionalProperties: false
  };

  try {
    // Uses the new 2-step Reasoning (GPT-OSS) -> Structuring (Llama-3.3) flow
    const result = await queryWorkerAIStructured(ai, analysisPrompt, schema);
    return result.questions;
  } catch (error) {
    console.error("Error generating smart questions:", error);
    // Fallback if AI fails
    return generateFallbackQuestions(validFiles as any, owner, repo);
  }
}

/**
 * Generate fallback questions if AI analysis fails
 */
function generateFallbackQuestions(
  files: Array<{ path: string; content: string }>,
  owner: string,
  repo: string
): DetailedQuestion[] {
  const questions: DetailedQuestion[] = [];

  // Check for common patterns
  const hasPackageJson = files.some((f) => f.path.includes("package.json"));
  const hasWebpack = files.some((f) =>
    f.path.includes("webpack") || f.content.includes("webpack")
  );
  const hasReact = files.some((f) => f.content.includes("react"));
  const hasEnv = files.some((f) => f.path.includes(".env"));

  if (hasPackageJson) {
    questions.push({
      query: "How do I migrate my Node.js dependencies to Cloudflare Workers?",
      cloudflare_bindings_involved: ["env"],
      node_libs_involved: ["npm", "package.json"],
      tags: ["migration", "dependencies", "nodejs"],
      relevant_code_files: [
        {
          file_path: "package.json",
          start_line: 1,
          end_line: 50,
          relation_to_question: "Project dependencies",
        },
      ],
    });
  }

  if (hasWebpack) {
    questions.push({
      query: "How do I replace Webpack with Cloudflare Workers build system?",
      cloudflare_bindings_involved: ["env"],
      node_libs_involved: ["webpack"],
      tags: ["migration", "build", "webpack"],
      relevant_code_files: [
        {
          file_path: files.find((f) => f.path.includes("webpack"))?.path || "webpack.config.js",
          start_line: 1,
          end_line: 100,
          relation_to_question: "Webpack configuration",
        },
      ],
    });
  }

  if (hasReact) {
    questions.push({
      query: "How do I deploy a React application to Cloudflare Pages?",
      cloudflare_bindings_involved: ["pages", "env"],
      node_libs_involved: ["react", "react-dom"],
      tags: ["migration", "react", "pages"],
      relevant_code_files: [
        {
          file_path: files.find((f) => f.path.includes("index") || f.path.includes("App"))?.path || "src/App.tsx",
          start_line: 1,
          end_line: 50,
          relation_to_question: "React application entry point",
        },
      ],
    });
  }

  if (hasEnv) {
    questions.push({
      query: "How do I manage environment variables in Cloudflare Workers?",
      cloudflare_bindings_involved: ["env", "secrets"],
      node_libs_involved: ["dotenv"],
      tags: ["migration", "environment", "secrets"],
      relevant_code_files: [
        {
          file_path: files.find((f) => f.path.includes(".env"))?.path || ".env.example",
          start_line: 1,
          end_line: 30,
          relation_to_question: "Environment variables",
        },
      ],
    });
  }

  // Always add a general migration question
  questions.push({
    query: `What are the key considerations for migrating ${repo} to Cloudflare Workers/Pages?`,
    cloudflare_bindings_involved: ["env", "kv"],
    node_libs_involved: [],
    tags: ["migration", "overview", "cloudflare"],
    relevant_code_files: [],
  });

  return questions;
}

/**
 * Deduplicate and merge questions
 */
export function deduplicateQuestions(
  existingQuestions: DetailedQuestion[],
  newQuestions: DetailedQuestion[]
): DetailedQuestion[] {
  const merged = [...existingQuestions];
  const existingQueries = new Set(existingQuestions.map((q) => q.query.toLowerCase()));

  for (const newQ of newQuestions) {
    if (!existingQueries.has(newQ.query.toLowerCase())) {
      merged.push(newQ);
      existingQueries.add(newQ.query.toLowerCase());
    }
  }

  return merged;
}

/**
 * Evaluate if existing questions are sufficient
 * Uses structured AI pipeline for decision making.
 */
export async function evaluateQuestionSufficiency(
  ai: Ai,
  existingQuestions: DetailedQuestion[],
  newQuestions: DetailedQuestion[]
): Promise<{ sufficient: boolean; reasoning: string; recommendedQuestions: DetailedQuestion[] }> {
  const prompt = `You are evaluating whether existing questions about a codebase migration are sufficient.

Existing Questions (${existingQuestions.length}):
${existingQuestions.map((q, i) => `${i + 1}. ${q.query}`).join("\n")}

Newly Generated Questions (${newQuestions.length}):
${newQuestions.map((q, i) => `${i + 1}. ${q.query}`).join("\n")}

Evaluate:
1. Are the existing questions comprehensive enough for a migration?
2. Do the new questions add significant value or cover new ground (e.g., database, auth)?
3. Which questions should be included in the final set?`;

  const schema = {
    type: "object",
    properties: {
      sufficient: { 
        type: "boolean",
        description: "True if existing questions are sufficient, false otherwise"
      },
      reasoning: { 
        type: "string",
        description: "Brief explanation of the evaluation"
      },
      add_new_questions: { 
        type: "array", 
        items: { type: "integer" },
        description: "Indices (0-based) of new questions to add to the existing set"
      }
    },
    required: ["sufficient", "reasoning", "add_new_questions"],
    additionalProperties: false
  };

  try {
    const evaluation = await queryWorkerAIStructured(ai, prompt, schema);
    const recommendedQuestions = [...existingQuestions];

    if (evaluation.add_new_questions && Array.isArray(evaluation.add_new_questions)) {
      for (const index of evaluation.add_new_questions) {
        if (index < newQuestions.length) {
          recommendedQuestions.push(newQuestions[index]);
        }
      }
    }

    return {
      sufficient: evaluation.sufficient || false,
      reasoning: evaluation.reasoning || "AI evaluation completed",
      recommendedQuestions,
    };
  } catch (error) {
    console.error("Error evaluating questions:", error);
    
    // Fallback: merge and deduplicate
    return {
      sufficient: existingQuestions.length > 0,
      reasoning: "Using automatic deduplication (fallback)",
      recommendedQuestions: deduplicateQuestions(existingQuestions, newQuestions),
    };
  }
}
