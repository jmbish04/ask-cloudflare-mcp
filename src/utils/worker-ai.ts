import { Env } from "../types";

/**
 * Query Worker AI for question rewriting and analysis
 */
export async function queryWorkerAI(
  ai: Ai,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  try {
    const messages: any[] = [];

    if (systemPrompt) {
      messages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    messages.push({
      role: "user",
      content: prompt,
    });

    const response = await ai.run("@cf/meta/llama-3.1-8b-instruct" as any, {
      messages,
    } as any);

    // Extract the response content
    if (response && typeof response === "object" && "response" in response) {
      return (response as any).response;
    }

    return JSON.stringify(response);
  } catch (error) {
    console.error("Worker AI error:", error);
    throw error;
  }
}

/**
 * Rewrite a question with full context for MCP
 */
export async function rewriteQuestionForMCP(
  ai: Ai,
  question: string,
  context?: {
    bindings?: string[];
    libraries?: string[];
    tags?: string[];
    codeSnippets?: Array<{
      file_path: string;
      code: string;
      relation: string;
    }>;
  }
): Promise<string> {
  const systemPrompt = `You are a technical documentation assistant. Your task is to rewrite user questions to be clear, comprehensive, and well-suited for querying the Cloudflare documentation.`;

  let prompt = `Original Question: ${question}\n\n`;

  if (context) {
    if (context.bindings && context.bindings.length > 0) {
      prompt += `Cloudflare Bindings Involved: ${context.bindings.join(", ")}\n`;
    }
    if (context.libraries && context.libraries.length > 0) {
      prompt += `Node.js Libraries: ${context.libraries.join(", ")}\n`;
    }
    if (context.tags && context.tags.length > 0) {
      prompt += `Tags: ${context.tags.join(", ")}\n`;
    }
    if (context.codeSnippets && context.codeSnippets.length > 0) {
      prompt += `\nRelevant Code Context:\n`;
      for (const snippet of context.codeSnippets) {
        prompt += `\nFile: ${snippet.file_path}\n`;
        prompt += `Relation: ${snippet.relation}\n`;
        prompt += `Code:\n${snippet.code}\n`;
      }
    }
  }

  prompt += `\nPlease rewrite this question with full context and formal technical phrasing, optimized for querying Cloudflare documentation. Focus on the specific Cloudflare features and integration points.`;

  return await queryWorkerAI(ai, prompt, systemPrompt);
}

/**
 * Analyze MCP response and generate follow-up questions
 */
export async function analyzeResponseAndGenerateFollowUps(
  ai: Ai,
  originalQuestion: string,
  mcpResponse: any
): Promise<{ analysis: string; followUpQuestions: string[] }> {
  const systemPrompt = `You are a technical documentation analyst. Analyze responses from documentation and identify gaps or areas that need clarification.`;

  const prompt = `Original Question: ${originalQuestion}

Documentation Response: ${JSON.stringify(mcpResponse, null, 2)}

Please:
1. Analyze if the response fully answers the question
2. Identify any gaps or unclear areas
3. Generate 2-3 specific follow-up questions if needed (or return empty array if fully answered)

Respond in JSON format:
{
  "analysis": "Brief analysis of the response quality and completeness",
  "followUpQuestions": ["question 1", "question 2", ...]
}`;

  const response = await queryWorkerAI(ai, prompt, systemPrompt);

  try {
    // Try to parse as JSON
    const parsed = JSON.parse(response);
    return {
      analysis: parsed.analysis || "",
      followUpQuestions: parsed.followUpQuestions || [],
    };
  } catch {
    // If not valid JSON, return the raw analysis
    return {
      analysis: response,
      followUpQuestions: [],
    };
  }
}

/**
 * Stream Worker AI response
 */
export async function streamWorkerAI(
  ai: Ai,
  prompt: string,
  systemPrompt?: string
): Promise<ReadableStream> {
  const messages: any[] = [];

  if (systemPrompt) {
    messages.push({
      role: "system",
      content: systemPrompt,
    });
  }

  messages.push({
    role: "user",
    content: prompt,
  });

  const response = await ai.run("@cf/meta/llama-3.1-8b-instruct" as any, {
    messages,
    stream: true,
  } as any);

  return response as ReadableStream;
}
