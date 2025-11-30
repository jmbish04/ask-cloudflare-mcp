import { Env } from "../types";

/**
 * Get the default branch name for a repository
 * (Added for Option 2: Robust Fix)
 */
export async function getDefaultBranch(
  owner: string,
  repo: string,
  token: string
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch repo info: ${response.status}`);
  }

  const data = await response.json();
  return data.default_branch;
}

/**
 * Fetch file content from GitHub
 */
export async function fetchGitHubFile(
  owner: string,
  repo: string,
  path: string,
  token: string,
  ref?: string // Changed to optional for dynamic default branch
): Promise<string> {
  // Use provided ref or fetch default branch
  const branch = ref || await getDefaultBranch(owner, repo, token);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  const data = (await response.json()) as { content: string; encoding: string };

  if (data.encoding === "base64") {
    // Decode base64 content
    return atob(data.content.replace(/\n/g, ""));
  }

  return data.content || "";
}

/**
 * Fetch multiple files from GitHub
 */
export async function fetchGitHubFiles(
  owner: string,
  repo: string,
  files: Array<{ path: string; start_line?: number; end_line?: number }>,
  token: string,
  ref?: string // Changed to optional for dynamic default branch
): Promise<
  Array<{
    path: string;
    content: string;
    snippet?: string;
  }>
> {
  // Resolve branch once for all files if not provided
  const branch = ref || await getDefaultBranch(owner, repo, token);

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fetchGitHubFile(owner, repo, file.path, token, branch);

        // Extract snippet if line numbers provided
        let snippet: string | undefined;
        if (file.start_line && file.end_line) {
          const lines = content.split("\n");
          const start = Math.max(0, file.start_line - 1);
          const end = Math.min(lines.length, file.end_line);
          snippet = lines.slice(start, end).join("\n");
        }

        return {
          path: file.path,
          content,
          snippet: snippet || content,
        };
      } catch (error) {
        console.error(`Error fetching ${file.path}:`, error);
        return {
          path: file.path,
          content: "",
          snippet: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    })
  );

  return results;
}

/**
 * Get repository structure
 */
export async function getRepoStructure(
  owner: string,
  repo: string,
  token: string,
  path: string = "",
  ref?: string // Changed to optional for dynamic default branch
): Promise<any> {
  const branch = ref || await getDefaultBranch(owner, repo, token);
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  return await response.json();
}

/**
 * Search code in a repository
 */
export async function searchRepoCode(
  owner: string,
  repo: string,
  query: string,
  token: string
): Promise<any> {
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(
    query
  )}+repo:${owner}/${repo}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  return await response.json();
}

/**
 * Extract code snippets from GitHub files based on line ranges
 */
export async function extractCodeSnippets(
  owner: string,
  repo: string,
  files: Array<{
    file_path: string;
    start_line: number;
    end_line: number;
    relation_to_question: string;
  }>,
  token: string,
  ref?: string // Changed to optional for dynamic default branch
): Promise<
  Array<{
    file_path: string;
    code: string;
    relation: string;
  }>
> {
  const branch = ref || await getDefaultBranch(owner, repo, token);

  const snippets = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fetchGitHubFile(
          owner,
          repo,
          file.file_path,
          token,
          branch
        );

        const lines = content.split("\n");
        const start = Math.max(0, file.start_line - 1);
        const end = Math.min(lines.length, file.end_line);
        const code = lines.slice(start, end).join("\n");

        return {
          file_path: file.file_path,
          code,
          relation: file.relation_to_question,
        };
      } catch (error) {
        console.error(`Error extracting snippet from ${file.file_path}:`, error);
        return {
          file_path: file.file_path,
          code: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          relation: file.relation_to_question,
        };
      }
    })
  );

  return snippets;
}

/**
 * Fetch code review comments from a Pull Request
 */
export async function getPRCodeComments(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<Array<{
  id: number;
  body: string;
  path: string;
  line: number;
  user: { login: string };
  created_at: string;
}>> {
  // This endpoint gets comments on specific lines of code (review comments)
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error (${response.status}): ${await response.text()}`
    );
  }

  return await response.json();
}
