import { Env } from "../types";

/**
 * Fetch file content from GitHub
 */
export async function fetchGitHubFile(
  owner: string,
  repo: string,
  path: string,
  token: string,
  ref: string = "main"
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;

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
  ref: string = "main"
): Promise<
  Array<{
    path: string;
    content: string;
    snippet?: string;
  }>
> {
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fetchGitHubFile(owner, repo, file.path, token, ref);

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
  ref: string = "main"
): Promise<any> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;

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
  ref: string = "main"
): Promise<
  Array<{
    file_path: string;
    code: string;
    relation: string;
  }>
> {
  const snippets = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await fetchGitHubFile(
          owner,
          repo,
          file.file_path,
          token,
          ref
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
 * Parse PR URL to extract owner, repo, and PR number
 */
export function parsePRUrl(prUrl: string): { owner: string; repo: string; prNumber: number } | null {
  const regex = /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/;
  const match = prUrl.match(regex);

  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    prNumber: parseInt(match[3], 10),
  };
}

/**
 * Get all comments from a PR (both review comments and issue comments)
 */
export async function getPRComments(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<Array<{
  id: number;
  author: string;
  body: string;
  file_path?: string;
  line?: number;
  comment_type: 'review' | 'issue';
}>> {
  // Get review comments (inline code comments)
  const reviewCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`;
  const reviewCommentsResponse = await fetch(reviewCommentsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!reviewCommentsResponse.ok) {
    throw new Error(
      `GitHub API error (${reviewCommentsResponse.status}): ${await reviewCommentsResponse.text()}`
    );
  }

  const reviewComments = await reviewCommentsResponse.json() as any[];

  // Get issue comments (general PR comments)
  const issueCommentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  const issueCommentsResponse = await fetch(issueCommentsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker-MCP",
    },
  });

  if (!issueCommentsResponse.ok) {
    throw new Error(
      `GitHub API error (${issueCommentsResponse.status}): ${await issueCommentsResponse.text()}`
    );
  }

  const issueComments = await issueCommentsResponse.json() as any[];

  // Combine and normalize comments
  const allComments = [
    ...reviewComments.map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "unknown",
      body: comment.body || "",
      file_path: comment.path,
      line: comment.line || comment.original_line,
      comment_type: 'review' as const,
    })),
    ...issueComments.map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "unknown",
      body: comment.body || "",
      comment_type: 'issue' as const,
    })),
  ];

  return allComments;
}

/**
 * Filter comments by author (case-insensitive partial match)
 */
export function filterCommentsByAuthor(
  comments: Array<{ author: string; [key: string]: any }>,
  authorFilter?: string
): Array<{ author: string; [key: string]: any }> {
  if (!authorFilter) {
    return comments;
  }

  const lowerFilter = authorFilter.toLowerCase();
  return comments.filter((comment) =>
    comment.author.toLowerCase().includes(lowerFilter)
  );
}
