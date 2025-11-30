import { Env, DetailedQuestion } from "../types";
import { queryWorkerAIStructured } from "./worker-ai";
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
 * Analyze repository and generate questions using Worker AI & Cloudflare Docs
 */
export async function analyzeRepoAndGenerateQuestions(
  ai: Ai,
  owner: string,
  repo: string,
  token: string,
  maxFiles: number = 50
): Promise<DetailedQuestion[]> {
  console.log(`[Analyzer] Analyzing ${owner}/${repo}...`);

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

  // 2. Fetch Cloudflare Documentation Index (llms.txt)
  let docsContext = "";
  try {
    console.log(`[Analyzer] Fetching Cloudflare Docs Index (llms.txt)...`);
    const docSections = await fetchCloudflareDocsIndex();
    
    // Summarize index for AI selection
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

    Identify the technology stack (e.g. React, Postgres, Python) and select 3-5 specific Cloudflare documentation URLs that are most relevant for migrating this specific stack.
    For example:
    - If Postgres found -> select Hyperdrive or D1 docs.
    - If React found -> select Pages docs.
    - If Express found -> select Workers docs.
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

    const selection = await queryWorkerAIStructured(ai, selectionPrompt, selectionSchema);
    
    // Resolve URLs from the selection
    const targetUrls: string[] = [];
    if (selection.relevant_urls && Array.isArray(selection.relevant_urls)) {
      // Helper to match title/url from our index
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

    // 4. Fetch the selected documentation pages
    if (targetUrls.length > 0) {
      console.log(`[Analyzer] Fetching ${targetUrls.length} doc pages...`);
      const fetchedDocs = await fetchDocPages(targetUrls);
      docsContext = fetchedDocs.map(d => `\n=== CLOUDFLARE DOCS (${d.url}) ===\n${d.content}`).join("\n");
    }

  } catch (error) {
    console.warn("[Analyzer] Docs retrieval failed, proceeding with repo context only:", error);
  }

  // 5. Generate Specific Questions using Repo + Docs Context
  const finalPrompt = `You are a Senior Cloud Architect.
  
  REPO ANALYSIS:
  ${repoContext}

  RELEVANT CLOUDFLARE DOCUMENTATION:
  ${docsContext}

  TASK:
  Generate 3-5 highly specific, technical questions to ask the Cloudflare MCP about migrating this repository.
  
  GUIDELINES:
  1. Do NOT ask generic questions like "Can I run this?".
  2. Ask specifically about mapping [Repo Feature] to [Cloudflare Product found in Docs].
  3. Example: "How do I migrate the 'pg' connection in 'db.js' to use Cloudflare Hyperdrive?"
  4. Example: "How do I deploy the 'webpack.config.js' build output to Cloudflare Pages?"
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
    const result = await queryWorkerAIStructured(ai, finalPrompt, finalSchema);
    return result.questions;
  } catch (error) {
    console.error("[Analyzer] AI generation failed, using fallback:", error);
    return generateFallbackQuestions(validFiles, owner, repo);
  }
}

/**
 * Generate fallback questions (Pattern-based)
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
