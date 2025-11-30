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
 */
async function runReasoningStep(
  ai: Ai, 
  prompt: string, 
  systemPrompt?: string
): Promise<string> {
  const messages: any[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  const response = await ai.run(REASONING_MODEL as any, {
    messages,
  } as any);

  // Handle potential different response shapes
  if (response && typeof response === "object") {
    if ("response" in response) return (response as any).response;
    if ("content" in response) return (response as any).content; // Some OpenAI compat models
  }
  
  return JSON.stringify(response);
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
  Extract the information from the user provided analysis and format it strictly according to the provided JSON schema.
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
    if (context.bindings?.length) prompt += `Bindings: ${context.bindings.join(", ")}\n`;
    if (context.libraries?.length) prompt += `Libraries: ${context.libraries.join(", ")}\n`;
    if (context.tags?.length) prompt += `Tags: ${context.tags.join(", ")}\n`;
    if (context.codeSnippets?.length) {
      prompt += `\nCode Context:\n${context.codeSnippets.map(s => 
        `File: ${s.file_path} (${s.relation})\n${s.code}`
      ).join("\n\n")}`;
    }
  }

  prompt += `\nRewrite this question with technical precision.`;

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
  const systemPrompt = `Analyze the documentation response. Identify gaps and generate follow-up questions.`;

  const prompt = `Original Question: ${originalQuestion}
  Documentation Response: ${JSON.stringify(mcpResponse, null, 2)}`;

  // Strict Schema for Llama 3.3
  const schema = {
    type: "object",
    properties: {
      analysis: { 
        type: "string",
        description: "Analysis of the response quality and completeness" 
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
 * Stream Worker AI response
 * (Stays with Llama 3.3 for speed/consistency in streaming if needed, or fallback to Llama 3.1)
 * For now, we'll upgrade it to Llama 3.3 for better quality streaming
 */
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
