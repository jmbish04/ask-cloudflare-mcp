import { Env, DetailedQuestion } from "../types";
import { queryWorkerAI } from "./worker-ai";
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
 * Analyze repository and generate questions using Worker AI
 */
export async function analyzeRepoAndGenerateQuestions(
  ai: Ai,
  owner: string,
  repo: string,
  token: string,
  maxFiles: number = 50
): Promise<DetailedQuestion[]> {
  // Get file tree
  const allFiles = await getRepoFileTree(owner, repo, token);
  const relevantFiles = filterRelevantFiles(allFiles, maxFiles);

  // Read file contents
  const fileContents = await Promise.all(
    relevantFiles.slice(0, 10).map(async (file) => {
      try {
        const content = await fetchGitHubFile(owner, repo, file.path, token);
        return {
          path: file.path,
          content: content.substring(0, 5000), // Limit content size
        };
      } catch {
        return null;
      }
    })
  );

  const validFiles = fileContents.filter((f) => f !== null);

  // Analyze with Worker AI
  const analysisPrompt = `You are a technical analyst helping migrate a codebase to Cloudflare Workers/Pages.

Repository: ${owner}/${repo}
Files analyzed: ${validFiles.length}

File Structure:
${validFiles.map((f) => `- ${f!.path}`).join("\n")}

Sample File Contents:
${validFiles
  .slice(0, 3)
  .map((f) => `\n=== ${f!.path} ===\n${f!.content.substring(0, 1000)}...`)
  .join("\n")}

Please analyze this codebase and generate 5-10 specific questions about migrating to Cloudflare Workers/Pages.

For each question, provide:
1. The main question
2. Cloudflare bindings that might be relevant (env, kv, r2, durable-objects, ai, etc.)
3. Node libraries that are being used
4. Tags for categorization
5. Relevant code files with line ranges (estimate based on file size)

Return ONLY a valid JSON array with this structure:
[
  {
    "query": "How do I migrate environment variables to Cloudflare Workers?",
    "cloudflare_bindings_involved": ["env", "secrets"],
    "node_libs_involved": ["dotenv"],
    "tags": ["migration", "environment", "config"],
    "relevant_code_files": [
      {
        "file_path": "config/env.js",
        "start_line": 1,
        "end_line": 50,
        "relation_to_question": "Environment configuration file"
      }
    ]
  }
]`;

  try {
    const response = await queryWorkerAI(ai, analysisPrompt);

    // Parse the JSON response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in AI response");
    }

    const questions = JSON.parse(jsonMatch[0]) as DetailedQuestion[];
    return questions;
  } catch (error) {
    console.error("Error generating questions:", error);

    // Fallback: generate basic questions based on file analysis
    return generateFallbackQuestions(validFiles, owner, repo);
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
1. Are the existing questions comprehensive enough?
2. Do the new questions add significant value?
3. Which questions should be included in the final set?

Respond with a JSON object:
{
  "sufficient": false,
  "reasoning": "Brief explanation",
  "add_new_questions": [0, 1, 2]  // Indices of new questions to add
}`;

  try {
    const response = await queryWorkerAI(ai, prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const evaluation = JSON.parse(jsonMatch[0]);
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
    }
  } catch (error) {
    console.error("Error evaluating questions:", error);
  }

  // Fallback: merge and deduplicate
  return {
    sufficient: existingQuestions.length > 0,
    reasoning: "Using automatic deduplication",
    recommendedQuestions: deduplicateQuestions(existingQuestions, newQuestions),
  };
}
