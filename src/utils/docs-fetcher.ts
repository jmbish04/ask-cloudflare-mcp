/**
 * Utilities for fetching and parsing Cloudflare documentation via llms.txt
 */

export interface DocSection {
  title: string;
  links: { title: string; url: string; description?: string }[];
}

/**
 * Fetch and parse the Cloudflare llms.txt file
 */
export async function fetchCloudflareDocsIndex(): Promise<DocSection[]> {
  try {
    const response = await fetch("https://developers.cloudflare.com/llms.txt");
    if (!response.ok) throw new Error("Failed to fetch llms.txt");
    
    const text = await response.text();
    return parseLLMsTxt(text);
  } catch (error) {
    console.error("Error fetching Cloudflare docs index:", error);
    return [];
  }
}

/**
 * Parse the llms.txt Markdown format into structured data
 */
function parseLLMsTxt(text: string): DocSection[] {
  const sections: DocSection[] = [];
  let currentSection: DocSection | null = null;

  const lines = text.split("\n");

  for (const line of lines) {
    // Check for Section Headers (## Section Name)
    if (line.startsWith("## ")) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        title: line.replace("## ", "").trim(),
        links: []
      };
      continue;
    }

    // Check for Links (- [Title](url): Description)
    // Regex matches: - [Title](URL): Description OR - [Title](URL)
    const linkMatch = line.match(/^\s*-\s*\[(.*?)\]\((.*?)\)(?::\s*(.*))?$/);
    
    if (linkMatch && currentSection) {
      const [_, title, url, description] = linkMatch;
      
      // Filter out utility links like "Changelog", "API Reference" unless specific
      // to keep context high-quality
      if (!isLowValueLink(title)) {
        currentSection.links.push({
          title,
          url,
          description: description || undefined
        });
      }
    }
  }

  if (currentSection) sections.push(currentSection);
  return sections;
}

/**
 * Helper to filter out generic pages that might dilute context
 */
function isLowValueLink(title: string): boolean {
  const lowValueTerms = ["Changelog", "Release notes", "Pricing", "Limits", "FAQ"];
  return lowValueTerms.some(term => title.includes(term));
}

/**
 * Fetch the content of specific documentation pages
 */
export async function fetchDocPages(urls: string[]): Promise<Array<{ url: string; content: string }>> {
  // Limit concurrency to avoid timeouts
  const uniqueUrls = [...new Set(urls)].slice(0, 5); // Max 5 pages
  
  const results = await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        
        let content = await response.text();
        
        // Simple cleanup if it's HTML (llms.txt usually points to .md, but just in case)
        if (content.trim().startsWith("<!DOCTYPE html>")) {
          // Very basic strip tags for context window efficiency
          content = content.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, "")
                           .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gm, "")
                           .replace(/<[^>]+>/g, " ");
        }
        
        // Truncate if huge
        return {
          url,
          content: content.substring(0, 10000)
        };
      } catch {
        return null;
      }
    })
  );

  return results.filter((r) => r !== null) as Array<{ url: string; content: string }>;
}
