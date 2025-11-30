import { Env } from "../types";

// Models configuration
const REASONING_MODEL = "@cf/openai/gpt-oss-120b";
const STRUCTURING_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * Standard query to Worker AI (Backward compatibility)
 * Now defaults to using GPT-OSS-120B for superior reasoning
 */
export async function queryWorkerAI(
  ai: Ai,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  return await runReasoningStep(ai, prompt, systemPrompt);
}

/**
 * New: 2-Step Chain
 * 1. Analyzes with GPT-OSS-120B (High Reasoning)
 * 2. Structures with Llama-3.3-70B (JSON Schema Enforcement)
 */
export async function queryWorkerAIStructured(
  ai: Ai,
  prompt: string,
  schema: object,
  systemPrompt?: string
): Promise<any> {
  try {
    // Step 1: Reasoning Phase (GPT-OSS-120B)
    // We let the superior model think freely without JSON constraints first
    const analysis = await runReasoningStep(ai, prompt, systemPrompt);

    // Step 2: Structuring Phase (Llama-3.3-70B)
    // We force the reasoning output into the strict JSON schema
    const structured = await runStructuringStep(ai, analysis, schema);
    
    return structured;
  } catch (error) {
    console.error("Structured AI Chain Error:", error);
    throw error;
  }
}

/**
 * Step 1: Run GPT-OSS-120B for raw analysis
 * VERIFIED: Uses strict 'input' format required by the Cloudflare schema
 */
async function runReasoningStep(
  ai: Ai, 
  prompt: string, 
  systemPrompt?: string
): Promise<string> {
  // GPT-OSS-120B via Workers AI strictly expects { input: string }
  // It does not accept the standard { messages: [] } format in the primary schema path
  const fullInput = systemPrompt 
    ? `Instructions: ${systemPrompt}\n\nUser Input: ${prompt}`
    : prompt;

  try {
    const response = await ai.run(REASONING_MODEL as any, {
      input: fullInput,
      reasoning: {
        effort: "high",
        summary: "concise"
      }
    } as any);

    // Parse the response based on the model's output format
    if (response && typeof response === "object") {
      // The model returns a generic object, usually with a 'response' or 'result' field
      if ("response" in response) return (response as any).response;
      if ("result" in response) return (response as any).result;
      
      // If it returns an array of responses (batch mode), take the first
      if (Array.isArray(response) && response.length > 0) {
        return response[0];
      }
    }
    
    return typeof response === "string" ? response : JSON.stringify(response);

  } catch (error) {
    console.error("GPT-OSS-120B Reasoning Error:", error);
    // Fallback: return the prompt itself or a basic error string so the chain doesn't break completely
    return `Analysis failed. Please proceed with best effort based on input: ${prompt.substring(0, 100)}...`;
  }
}

/**
 * Step 2: Run Llama-3.3-70B to force JSON structure
 * VERIFIED: Uses 'messages' and 'response_format' as required by schema
 */
async function runStructuringStep(
  ai: Ai, 
  content: string, 
  schema: object
): Promise<any> {
  const structuringPrompt = `You are a data extraction engine. 
  Extract the information from the provided analysis and format it strictly according to the provided JSON schema.
  Do not add any conversational text.`;

  const messages = [
    { role: "system", content: structuringPrompt },
    { role: "user", content: `Analysis Content:\n${content}` }
  ];

  const response = await ai.run(STRUCTURING_MODEL as any, {
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "extraction_result",
        schema: schema,
        strict: true
      }
    }
  } as any);

  // Llama 3.3 with response_format returns the JSON string in the response
  if (response && typeof response === "object" && "response" in response) {
    const rawOutput = (response as any).response;
    try {
      // FIX: Clean the output before parsing to handle Markdown code blocks (```json ... ```)
      const cleanedOutput = cleanJsonOutput(rawOutput);
      return JSON.parse(cleanedOutput);
    } catch (e) {
      console.error("Failed to parse Llama 3.3 JSON output:", rawOutput);
      throw new Error("AI failed to produce valid JSON");
    }
  }

  throw new Error("Unexpected response format from Structuring Step");
}

/**
 * Helper to strip Markdown formatting from JSON output
 */
function cleanJsonOutput(text: string): string {
  let clean = text.trim();
  // Remove ```json ... ``` or just ``` ... ``` wrappers
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "");
  }
  return clean;
}

/**
 * Rewrite a question with full context for MCP
 * (Backward compatible export)
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
  const systemPrompt = `You are a technical documentation assistant. Rewrite the user question to be clear, comprehensive, and well-suited for querying Cloudflare documentation.`;

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

  // Schema to force the output we want
  const schema = {
    type: "object",
    properties: {
      rewritten_question: { 
        type: "string", 
        description: "The rewritten, technical version of the question." 
      }
    },
    required: ["rewritten_question"],
    additionalProperties: false
  };

  const result = await queryWorkerAIStructured(ai, prompt, schema, systemPrompt);
  return result.rewritten_question;
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
3. Generate 2-3 specific follow-up questions if needed (or return empty array if fully answered)`;

  // Strict Schema for Llama 3.3
  const schema = {
    type: "object",
    properties: {
      analysis: { 
        type: "string",
        description: "Brief analysis of the response quality and completeness" 
      },
      followUpQuestions: { 
        type: "array",
        items: { type: "string" },
        description: "2-3 specific follow-up questions"
      }
    },
    required: ["analysis", "followUpQuestions"],
    additionalProperties: false
  };

  return await queryWorkerAIStructured(ai, prompt, schema, systemPrompt);
}

/**
 * Analyze if a code comment is related to Cloudflare and generate questions
 */
export async function analyzeCommentForCloudflare(
  ai: Ai,
  comment: string,
  context?: {
    filePath?: string;
    line?: number;
  }
): Promise<{
  isCloudflareRelated: boolean;
  cloudflareContext?: string;
  questions: string[];
}> {
  const systemPrompt = `You are a Cloudflare infrastructure expert. Analyze code comments to determine if they relate to Cloudflare-specific solutions, services, or integrations.`;

  let prompt = `Code Comment: ${comment}\n\n`;

  if (context?.filePath) {
    prompt += `File: ${context.filePath}\n`;
  }
  if (context?.line) {
    prompt += `Line: ${context.line}\n`;
  }

  prompt += `\nAnalyze if this comment relates to Cloudflare solutions such as:
- Cloudflare Workers
- Cloudflare Pages
- D1 (database)
- KV (key-value store)
- R2 (object storage)
- Durable Objects
- Queues
- AI bindings
- Analytics Engine
- Email routing
- Stream
- Images
- Workers AI
- Vectorize
- Hyperdrive
- Browser rendering
- Any other Cloudflare service or integration

If it IS related to Cloudflare, generate 2-4 specific technical questions about the comment that would benefit from querying Cloudflare documentation.

Respond in JSON format:
{
  "isCloudflareRelated": true/false,
  "cloudflareContext": "Brief description of which Cloudflare service/feature is involved (if related)",
  "questions": ["question 1", "question 2", ...]
}`;

  const response = await queryWorkerAI(ai, prompt, systemPrompt);

  try {
    // Try to parse as JSON
    const parsed = JSON.parse(response);
    return {
      isCloudflareRelated: parsed.isCloudflareRelated || false,
      cloudflareContext: parsed.cloudflareContext,
      questions: parsed.questions || [],
    };
  } catch (error) {
    // If not valid JSON, assume not Cloudflare-related
    console.error("Failed to parse Cloudflare analysis response:", error);
    return {
      isCloudflareRelated: false,
      questions: [],
    };
  }
}

/**
 * Stream Worker AI response
 * Uses Llama 3.3 for consistent streaming quality
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

  const response = await ai.run(STRUCTURING_MODEL as any, {
    messages,
    stream: true,
  } as any);

  return response as ReadableStream;
}
