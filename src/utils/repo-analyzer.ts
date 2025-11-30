import { Env, DetailedQuestion } from "../types";
import { queryWorkerAIStructured } from "./worker-ai";
import { queryGeminiStructured } from "./gemini"; // Import Gemini
import { getRepoStructure, fetchGitHubFile } from "./github";
import { fetchCloudflareDocsIndex, fetchDocPages } from "./docs-fetcher";

/**
 * Parse GitHub repository URL
 */
export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
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
  if (currentDepth >= maxDepth) return [];

  const contents = await getRepoStructure(owner, repo, token, path);
  const files: Array<{ path: string; type: string; size?: number }> = [];

  if (!Array.isArray(contents)) return [];

  for (const item of contents) {
    if (item.type === "file") {
      files.push({
        path: item.path,
        type: item.type,
        size: item.size,
      });
    } else if (item.type === "dir") {
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
 * Filter relevant files for analysis
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
    ".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".rs", ".java", ".php", ".rb",
    ".vue", ".svelte", ".json", ".yaml", ".yml", ".toml", ".config.js", ".config.ts",
    "Dockerfile", "Procfile"
  ];

  const filtered = files.filter((file) => {
    if (ignorePaths.some((ignore) => file.path.includes(ignore))) return false;
    return (
      relevantExtensions.some((ext) => file.path.endsWith(ext)) ||
      file.path.includes("config") ||
      file.path.includes("webpack") ||
      file.path.includes("vite") ||
      file.path.includes("wrangler")
    );
  });

  filtered.sort((a, b) => {
    const aIsConfig = a.path.includes("config") || a.path.includes("wrangler") || a.path.includes("package.json");
    const bIsConfig = b.path.includes("config") || b.path.includes("wrangler") || b.path.includes("package.json");
    if (aIsConfig && !bIsConfig) return -1;
    if (!aIsConfig && bIsConfig) return 1;
    return a.path.localeCompare(b.path);
  });

  return filtered.slice(0, maxFiles);
}

/**
 * Analyze repository and generate questions
 * Supports switching between Worker AI and Gemini
 */
export async function analyzeRepoAndGenerateQuestions(
  env: Env, // Changed from 'ai: Ai' to 'env: Env' to support Gemini config
  owner: string,
  repo: string,
  token: string,
  maxFiles: number = 50,
  useGemini: boolean = false // New flag
): Promise<DetailedQuestion[]> {
  console.log(`[Analyzer] Analyzing ${owner}/${repo}... (Provider: ${useGemini ? "Gemini" : "Workers AI"})`);

  // 1. Fetch Repository Files
  const allFiles = await getRepoFileTree(owner, repo, token);
  const relevantFiles = filterRelevantFiles(allFiles, maxFiles);

  const fileContents = await Promise.all(
    relevantFiles.slice(0, 15).map(async (file) => {
      try {
        const content = await fetchGitHubFile(owner, repo, file.path, token);
        return {
          path: file.path,
          content: content.substring(0, 8000), 
        };
      } catch {
        return null;
      }
    })
  );
  const validFiles = fileContents.filter((f) => f !== null) as Array<{ path: string; content: string }>;
  const repoContext = validFiles.map((f) => `\n=== ${f.path} ===\n${f.content.substring(0, 1500)}...`).join("\n");

  // Helper to query selected provider with Fallback
  const queryAI = async (prompt: string, schema: object, sysPrompt?: string) => {
    if (useGemini) {
      if (!env.CF_AIG_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
        console.warn("[Analyzer] Gemini requested but missing credentials. Falling back to Workers AI.");
        return await queryWorkerAIStructured(env.AI, prompt, schema, sysPrompt);
      }
      return await queryGeminiStructured(env as any, prompt, schema, sysPrompt);
    } else {
      return await queryWorkerAIStructured(env.AI, prompt, schema, sysPrompt);
    }
  };

  // 2. Fetch Cloudflare Documentation Index (llms.txt)
  let docsContext = "";
  try {
    console.log(`[Analyzer] Fetching Cloudflare Docs Index (llms.txt)...`);
    const docSections = await fetchCloudflareDocsIndex();
    
    const indexSummary = docSections.map(s => 
      `Product: ${s.title}\nPages: ${s.links.slice(0, 5).map(l => l.title).join(", ")}`
    ).join("\n\n");

    // 3. Ask AI to select relevant documentation
    const selectionPrompt = `You are a Solutions Architect. 
    Analyze the repository context and the available Cloudflare documentation.
    
    REPO CONTEXT:
    ${repoContext.substring(0, 4000)}

    AVAILABLE DOCS:
    ${indexSummary}

    Identify the technology stack and select 3-5 specific Cloudflare documentation URLs.
    `;

    const selectionSchema = {
      type: "object",
      properties: {
        stack_detected: { type: "string" },
        relevant_urls: { 
          type: "array", 
          items: { type: "string" },
          description: "List of full URLs to fetch"
        }
      },
      required: ["relevant_urls"],
      additionalProperties: false
    };

    const selection = await queryAI(selectionPrompt, selectionSchema);
    
    const targetUrls: string[] = [];
    if (selection.relevant_urls && Array.isArray(selection.relevant_urls)) {
      const findUrl = (hint: string) => {
        for (const sec of docSections) {
          for (const link of sec.links) {
            if (link.url === hint || link.title === hint) return link.url;
          }
        }
        return hint.startsWith('http') ? hint : null;
      };

      selection.relevant_urls.forEach((hint: string) => {
        const url = findUrl(hint);
        if (url) targetUrls.push(url);
      });
    }

    if (targetUrls.length > 0) {
      console.log(`[Analyzer] Fetching ${targetUrls.length} doc pages...`);
      const fetchedDocs = await fetchDocPages(targetUrls);
      docsContext = fetchedDocs.map(d => `\n=== CLOUDFLARE DOCS (${d.url}) ===\n${d.content}`).join("\n");
    }

  } catch (error) {
    console.warn("[Analyzer] Docs retrieval failed, proceeding with repo context only:", error);
  }

  // 5. Generate Specific Questions
  const finalPrompt = `You are a Senior Cloud Architect.
  
  REPO ANALYSIS:
  ${repoContext}

  RELEVANT CLOUDFLARE DOCUMENTATION:
  ${docsContext}

  TASK:
  Generate 3-5 highly specific, technical questions to ask the Cloudflare MCP about migrating this repository.
  `;

  const finalSchema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            query: { type: "string" },
            cloudflare_bindings_involved: { type: "array", items: { type: "string" } },
            node_libs_involved: { type: "array", items: { type: "string" } },
            tags: { type: "array", items: { type: "string" } },
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
    const result = await queryAI(finalPrompt, finalSchema);
    return result.questions;
  } catch (error) {
    console.error("[Analyzer] AI generation failed, using fallback:", error);
    return generateFallbackQuestions(validFiles, owner, repo);
  }
}

/**
 * Generate fallback questions
 */
function generateFallbackQuestions(
  files: Array<{ path: string; content: string }>,
  owner: string,
  repo: string
): DetailedQuestion[] {
  const questions: DetailedQuestion[] = [];

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

  questions.push({
    query: `What are the key considerations for migrating ${repo} to Cloudflare Workers/Pages?`,
    cloudflare_bindings_involved: ["env", "kv"],
    node_libs_involved: [],
    tags: ["migration", "overview", "cloudflare"],
    relevant_code_files: [],
  });

  return questions;
}

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

export async function evaluateQuestionSufficiency(
  ai: Ai,
  existingQuestions: DetailedQuestion[],
  newQuestions: DetailedQuestion[]
): Promise<{ sufficient: boolean; reasoning: string; recommendedQuestions: DetailedQuestion[] }> {
  // Keeping this simple for now, can be updated to use provider if needed
  return { sufficient: existingQuestions.length > 0, reasoning: "Fallback", recommendedQuestions: deduplicateQuestions(existingQuestions, newQuestions) };
}
