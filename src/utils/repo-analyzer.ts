import { Env, DetailedQuestion } from "../types";
import { queryWorkerAIStructured } from "./worker-ai";
import { getRepoStructure, fetchGitHubFile } from "./github";
import { fetchCloudflareDocsIndex, fetchDocPages } from "./docs-fetcher";

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
 * Analyze repository and generate questions using Worker AI 
 * Enhanced with Cloudflare Docs Retrieval (llms.txt)
 */
export async function analyzeRepoAndGenerateQuestions(
  ai: Ai,
  owner: string,
  repo: string,
  token: string,
  maxFiles: number = 50
): Promise<DetailedQuestion[]> {
  // --- Phase 1: Repository Context Extraction ---
  console.log(`[Analyzer] Phase 1: Fetching repo files for ${owner}/${repo}...`);
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
  const validFiles = fileContents.filter((f) => f !== null);
  const repoContext = validFiles.map((f) => `\n=== ${f!.path} ===\n${f!.content.substring(0, 1500)}...`).join("\n");


  // --- Phase 2: Stack Detection & Doc Selection ---
  console.log(`[Analyzer] Phase 2: Identifying stack and selecting relevant docs...`);
  
  // Fetch the master docs index
  const allDocSections = await fetchCloudflareDocsIndex();
  
  // Flatten for AI selection (title + specific links)
  const docsSummary = allDocSections.map(s => 
    `Product: ${s.title}\nPages: ${s.links.slice(0, 5).map(l => l.title).join(", ")}`
  ).join("\n\n");

  const docSelectionPrompt = `You are a Cloudflare Solutions Architect.
  
  REPO CONTEXT:
  ${repoContext.substring(0, 5000)} // Truncated for token limits

  AVAILABLE CLOUDFLARE DOCUMENTATION SECTIONS:
  ${docsSummary}

  Identify the specific technology stack of the repository (Language, Framework, Database).
  Then, select the 3-5 most relevant Cloudflare Product Documentation URLs that would help migrate this specific stack.
  
  Example:
  - If Repo uses Postgres -> Select Hyperdrive or D1 docs.
  - If Repo uses Express/Node -> Select Workers or Workers VPC docs.
  - If Repo uses Python -> Select Python Workers docs.
  `;

  const docSelectionSchema = {
    type: "object",
    properties: {
      detected_stack: { type: "string" },
      relevant_doc_urls: { 
        type: "array", 
        items: { type: "string" },
        description: "Full URLs to the relevant documentation pages"
      }
    },
    required: ["detected_stack", "relevant_doc_urls"],
    additionalProperties: false
  };

  let selectedDocsContent = "";
  
  try {
    // Ask AI which docs to fetch
    const selectionResult = await queryWorkerAIStructured(ai, docSelectionPrompt, docSelectionSchema);
    
    // Resolve the selected titles/URLs against the real list (fuzzy match or direct if AI was good)
    // For simplicity, we assume AI returns valid URLs or we match them against our index. 
    // Here we'll try to find the URLs in our index if AI returned titles, or just use URLs.
    
    const targetUrls: string[] = [];
    
    // Helper to find URL in index
    const findUrl = (hint: string) => {
        for (const sec of allDocSections) {
            for (const link of sec.links) {
                if (link.url === hint || link.title === hint) return link.url;
            }
        }
        return hint.startsWith('http') ? hint : null;
    };

    if (selectionResult.relevant_doc_urls) {
        selectionResult.relevant_doc_urls.forEach((hint: string) => {
            const url = findUrl(hint);
            if (url) targetUrls.push(url);
        });
    }

    console.log(`[Analyzer] Selected Docs:`, targetUrls);

    // --- Phase 3: Fetch Documentation Content ---
    if (targetUrls.length > 0) {
        const fetchedDocs = await fetchDocPages(targetUrls);
        selectedDocsContent = fetchedDocs.map(d => `\n=== CLOUDFLARE DOCS: ${d.url} ===\n${d.content}`).join("\n");
    }

  } catch (error) {
    console.error("Error in Doc Selection Phase:", error);
    // Proceed without docs if this fails
  }


  // --- Phase 4: Final Question Generation ---
  console.log(`[Analyzer] Phase 4: Generating questions with Stack + Docs context...`);

  const finalPrompt = `You are a Senior Cloud Architect. Generate deep, technical migration questions.

  REPO STACK ANALYSIS:
  ${repoContext}

  RELEVANT CLOUDFLARE DOCUMENTATION (Context Source):
  ${selectedDocsContent}

  TASK:
  Generate 3-5 highly specific questions to ask the Cloudflare MCP.
  The questions must be grounded in the Repo's actual code and the provided Cloudflare Docs.
  
  Rules:
  1. Do NOT ask generic "Can I run this?".
  2. Ask "How do I implement [Repo Feature X] using [Cloudflare Feature Y described in docs]?".
  3. If the repo uses a specific library (e.g. 'pg'), ask how to use it with the specific Cloudflare binding found in the docs (e.g. Hyperdrive).
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
    console.error("Error generating final questions:", error);
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
  // [Implementation identical to previous version]
  const prompt = `Evaluate question sufficiency.\nExisting: ${existingQuestions.length}\nNew: ${newQuestions.length}`;
  const schema = {
    type: "object",
    properties: {
      sufficient: { type: "boolean" },
      reasoning: { type: "string" },
      add_new_questions: { type: "array", items: { type: "integer" } }
    },
    required: ["sufficient", "reasoning", "add_new_questions"],
    additionalProperties: false
  };

  try {
    const evaluation = await queryWorkerAIStructured(ai, prompt, schema);
    const recommendedQuestions = [...existingQuestions];
    if (evaluation.add_new_questions) {
      for (const index of evaluation.add_new_questions) {
        if (index < newQuestions.length) recommendedQuestions.push(newQuestions[index]);
      }
    }
    return { sufficient: evaluation.sufficient, reasoning: evaluation.reasoning, recommendedQuestions };
  } catch {
    return { sufficient: existingQuestions.length > 0, reasoning: "Fallback", recommendedQuestions: deduplicateQuestions(existingQuestions, newQuestions) };
  }
}
