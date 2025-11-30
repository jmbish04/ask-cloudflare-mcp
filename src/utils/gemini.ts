import { GoogleGenAI } from "@google/genai";
import { Env } from "../types";

// Extended Env to include Gemini secrets
type GeminiEnv = Env & {
  CF_AIG_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
};

// Configuration - matches user request
const GEMINI_MODEL = "gemini-2.5-flash"; 

/**
 * Initialize Gemini Client using Cloudflare AI Gateway
 */
function createGeminiClient(env: GeminiEnv) {
  if (!env.CF_AIG_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("Missing CF_AIG_TOKEN or CLOUDFLARE_ACCOUNT_ID in environment variables");
  }

  return new GoogleGenAI({
    apiKey: env.CF_AIG_TOKEN,
    httpOptions: {
      // Proxies requests through Cloudflare AI Gateway for caching/monitoring
      baseUrl: `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/google-gemini-gateway/google-ai-studio`,
    },
  });
}

/**
 * Standard query to Gemini
 * Mirrors: queryWorkerAI
 */
export async function queryGemini(
  env: GeminiEnv,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const client = createGeminiClient(env);
  
  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    });

    return response.text() || "";
  } catch (error) {
    console.error("Gemini Query Error:", error);
    throw error;
  }
}

/**
 * Structured query to Gemini
 * Mirrors: queryWorkerAIStructured
 * * Note: Unlike the 2-step process in worker-ai.ts (GPT-OSS -> Llama),
 * Gemini supports JSON schema natively, so this is a single, faster call.
 */
export async function queryGeminiStructured(
  env: GeminiEnv,
  prompt: string,
  schema: object,
  systemPrompt?: string
): Promise<any> {
  const client = createGeminiClient(env);

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: schema as any, 
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    });

    const text = response.text();
    if (!text) throw new Error("Empty response from Gemini");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Structured Query Error:", error);
    throw error;
  }
}

/**
 * Rewrite a question with full context for MCP
 * Mirrors: rewriteQuestionForMCP
 */
export async function rewriteQuestionForMCP(
  env: GeminiEnv,
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
  const systemPrompt = `You are a technical documentation assistant. Rewrite the user question to be clear, comprehensive, and well-suited for querying Cloudflare documentation.`;

  let contextStr = "";
  if (context) {
    if (context.bindings?.length) contextStr += `Bindings: ${context.bindings.join(", ")}\n`;
    if (context.libraries?.length) contextStr += `Libraries: ${context.libraries.join(", ")}\n`;
    if (context.tags?.length) contextStr += `Tags: ${context.tags.join(", ")}\n`;
    if (context.codeSnippets?.length) {
      contextStr += `\nCode Context:\n${context.codeSnippets.map((s: any) => 
        `File: ${s.file_path} (${s.relation})\n${s.code}`
      ).join("\n\n")}`;
    }
  }

  const prompt = `Original Question: ${question}\n\n${contextStr}\nRewrite this question with technical precision for a search engine.`;

  const schema = {
    type: "OBJECT",
    properties: {
      rewritten_question: { 
        type: "STRING", 
        description: "The rewritten, technical version of the question." 
      }
    },
    required: ["rewritten_question"],
  };

  const result = await queryGeminiStructured(env, prompt, schema, systemPrompt);
  return result.rewritten_question;
}

/**
 * Analyze MCP response and generate follow-up questions
 * Mirrors: analyzeResponseAndGenerateFollowUps
 */
export async function analyzeResponseAndGenerateFollowUps(
  env: GeminiEnv,
  originalQuestion: string,
  mcpResponse: any
): Promise<{ analysis: string; followUpQuestions: string[] }> {
  const systemPrompt = `You are a technical documentation analyst. Analyze responses from documentation and identify gaps.`;

  const prompt = `Original Question: ${originalQuestion}

Documentation Response: ${JSON.stringify(mcpResponse, null, 2)}

Please:
1. Analyze if the response fully answers the question
2. Identify any gaps or unclear areas
3. Generate 2-3 specific follow-up questions if needed`;

  const schema = {
    type: "OBJECT",
    properties: {
      analysis: { 
        type: "STRING",
        description: "Brief analysis of the response quality" 
      },
      followUpQuestions: { 
        type: "ARRAY",
        items: { type: "STRING" },
        description: "2-3 specific follow-up questions"
      }
    },
    required: ["analysis", "followUpQuestions"],
  };

  return await queryGeminiStructured(env, prompt, schema, systemPrompt);
}

/**
 * Stream Gemini response
 * Mirrors: streamWorkerAI
 */
export async function streamGemini(
  env: GeminiEnv,
  prompt: string,
  systemPrompt?: string
): Promise<ReadableStream> {
  const client = createGeminiClient(env);
  
  try {
    const result = await client.models.generateContentStream({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    });

    // Convert Gemini Async Generator to standard ReadableStream for Cloudflare Workers
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(new TextEncoder().encode(text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    });
  } catch (error) {
    console.error("Gemini Stream Error:", error);
    throw error;
  }
}
