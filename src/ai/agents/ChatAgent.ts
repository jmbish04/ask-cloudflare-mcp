
import { BaseAgent } from "./BaseAgent";
import { AgentState } from "./types";

export interface ChatState extends AgentState {
    // Extended state can be added here
}

export class ChatAgent extends BaseAgent<Env, ChatState> {

    agentName = "Chat Agent";

    // -- ROUTER / ENTRYPOINT --

    async onRequest(request: Request) {
        if (request.method === "POST") {
            try {
                const { prompt, provider = "gemini", stream = false, health_check = false } = await request.json() as { prompt: string, provider?: 'gemini' | 'openai', stream?: boolean, health_check?: boolean };

                if (health_check) {
                    const health = await this.performSelfHealthCheck();
                    return Response.json(health);
                }

                if (!prompt) {
                    return Response.json({ error: "Missing prompt" }, { status: 400 });
                }

                if (stream) {
                    // Use the new streamResponse method
                    const result = await this.streamResponse(prompt, provider);
                    // Return the stream directly associated with the AI SDK result
                    // @ts-ignore - method exists in runtime
                    return result.toDataStreamResponse();
                }

                // Standard Generation
                let responseText = "";
                if (provider === "openai") {
                    responseText = await this.generateTextWithOpenAI(prompt);
                } else {
                    responseText = await this.generateTextWithGemini(prompt);
                }

                return Response.json({ response: responseText, provider });

            } catch (error) {
                console.error("ChatAgent Error:", error);
                return Response.json({ error: String(error) }, { status: 500 });
            }
        }
        return new Response("Method not allowed. Use POST.", { status: 405 });
    }
}
