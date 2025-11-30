import { Env } from "../types";

// Models configuration
const REASONING_MODEL = "@cf/openai/gpt-oss-120b";
const STRUCTURING_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

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
 * FIXED: Uses strict 'input' format required by the model to avoid 5006 errors
 */
async function runReasoningStep(
  ai: Ai, 
  prompt: string, 
  systemPrompt?: string
): Promise<string> {
  // Combine system prompt and user prompt into a single input string
  // as GPT-OSS-120B via Workers AI strictly expects { input: string } or { requests: [] }
  const fullInput = systemPrompt 
    ? `Instructions: ${systemPrompt}\n\nUser Input: ${prompt}`
    : prompt;

  try {
    const response = await ai.run(REASONING_MODEL as any, {
      input: fullInput,
      // Optional: Add reasoning parameters if supported by binding, 
      // but 'input' is the critical required field.
      reasoning: {
        effort: "high",
        summary: "concise"
      }
    } as any);

    // Parse the response based on the model's output format
    if (response && typeof response === "object") {
      // The model returns a generic object, usually with a 'response' or 'result' field
      // For GPT-OSS-120B specifically, we check the likely output keys
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
    throw error;
  }
}

/**
 * Step 2: Run Llama-3.3-70B to force JSON structure
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

  if (response && typeof response === "object" && "response" in response) {
    try {
      return JSON.parse((response as any).response);
    } catch (e) {
      console.error("Failed to parse Llama 3.3 JSON output:", (response as any).response);
      throw new Error("AI failed to produce valid JSON");
    }
  }

  throw new Error("Unexpected response format from Structuring Step");
}

/**
 * Rewrite a question with full context for MCP
 * (Backward compatible export)
 */
export async function rewriteQuestionForMCP(
  ai: Ai,
  question: string,
  context?: any
): Promise<string> {
  const systemPrompt = `You are a technical documentation assistant. Rewrite the user question to be clear, comprehensive, and well-suited for querying Cloudflare documentation.`;
  
  // Format context into a readable string
  let contextStr = "";
  if (context) {
    if (context.bindings?.length) contextStr += `Bindings: ${context.bindings.join(", ")}\n`;
    if (context.codeSnippets?.length) {
      contextStr += `\nCode Context:\n${context.codeSnippets.map((s: any) => 
        `File: ${s.file_path}\n${s.code}`
      ).join("\n\n")}`;
    }
  }

  const prompt = `Original Question: ${question}\n\n${contextStr}\nRewrite this question with technical precision for a search engine.`;

  const schema = {
    type: "object",
    properties: {
      rewritten_question: { type: "string" }
    },
    required: ["rewritten_question"],
    additionalProperties: false
  };

  const result = await queryWorkerAIStructured(ai, prompt, schema, systemPrompt);
  return result.rewritten_question;
}

export async function analyzeResponseAndGenerateFollowUps(
  ai: Ai,
  originalQuestion: string,
  mcpResponse: any
): Promise<{ analysis: string; followUpQuestions: string[] }> {
  const systemPrompt = `Analyze the documentation response. Identify gaps and generate follow-up questions.`;
  const prompt = `Original Question: ${originalQuestion}\nResponse: ${JSON.stringify(mcpResponse)}`;

  const schema = {
    type: "object",
    properties: {
      analysis: { type: "string" },
      followUpQuestions: { type: "array", items: { type: "string" } }
    },
    required: ["analysis", "followUpQuestions"],
    additionalProperties: false
  };

  return await queryWorkerAIStructured(ai, prompt, schema, systemPrompt);
}

// ... streamWorkerAI remains similar but uses STRUCTURING_MODEL for chat consistency
export async function streamWorkerAI(
  ai: Ai,
  prompt: string,
  systemPrompt?: string
): Promise<ReadableStream> {
  const messages: any[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const response = await ai.run(STRUCTURING_MODEL as any, {
    messages,
    stream: true,
  } as any);

  return response as ReadableStream;
}
