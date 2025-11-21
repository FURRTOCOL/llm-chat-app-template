/**
 * LLM Chat Application Template — Modified with multiple endpoints
 *
 * Adds:
 *  - /api/v0/gpt-oss-120b
 *  - /api/v0/llm3.2-3b
 */

import { Env, ChatMessage } from "./types";

// 원하는 모델들
const MODEL_GPT120B = "@cf/openai/gpt-oss-120b";   // 예시 모델 ID
const MODEL_LLM3B = "@cf/meta/llama-3.2-1b-instruct";          // 예시 모델 ID
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const SYSTEM_PROMPT =
  "You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Frontend assets
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // Unified chat POST handler
    if (request.method === "POST") {
      switch (url.pathname) {
        case "/api/chat":
          return handleChatRequest(request, env, DEFAULT_MODEL);

        case "/api/v0/gpt-oss-120b":          // 추가된 엔드포인트 1
          return handleChatRequest(request, env, MODEL_GPT120B);

        case "/api/v0/llm3.2-1b":             // 추가된 엔드포인트 2
          return handleChatRequest(request, env, MODEL_LLM3B);

        default:
          return new Response("Not found", { status: 404 });
      }
    }

    return new Response("Method not allowed", { status: 405 });
  },
} satisfies ExportedHandler<Env>;


// ================================
//   Chat Handler
// ================================
async function handleChatRequest(
  request: Request,
  env: Env,
  modelId: string,
): Promise<Response> {
  try {
    const { messages = [] } = (await request.json()) as {
      messages: ChatMessage[];
    };

    if (!messages.some((msg) => msg.role === "system")) {
      messages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    const response = await env.AI.run(
      modelId,
      {
        messages,
        max_tokens: 1024,
      },
      {
        returnRawResponse: true,
      },
    );

    return response;
  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
