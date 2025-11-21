/**
 * Cloudflare Workers — Full LLM Chat API with CORS + Multi Endpoints
 */

import { Env, ChatMessage } from "./types";

// === 모델 ID들 ===
const MODEL_DEFAULT = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODEL_GPT120B = "@cf/openai/gpt-oss-20b"; // 예시
const MODEL_LLM3_2_3B = "@cf/meta/llama-3.2-3b-instruct";  // 예시

const SYSTEM_PROMPT =
  "You are a helpful, friendly assistant. Provide concise and accurate responses.";

// === CORS 헤더 ===
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ==== CORS Preflight 처리 ====
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // ==== 정적 파일 처리 ====
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      const res = await env.ASSETS.fetch(request);

      // 정적 파일에도 CORS 적용
      const newHeaders = new Headers(res.headers);
      Object.entries(corsHeaders()).forEach(([k, v]) => newHeaders.set(k, v));

      return new Response(res.body, { status: res.status, headers: newHeaders });
    }

    // ==== API 라우팅 ====
    if (request.method === "POST") {
      switch (url.pathname) {
        case "/api/chat":
          return handleChatRequest(request, env, MODEL_DEFAULT);

        case "/api/v0/gpt-oss-120b":
          return handleChatRequest(request, env, MODEL_GPT120B);

        case "/api/v0/llm3.2-3b":
          return handleChatRequest(request, env, MODEL_LLM3_2_3B);

        default:
          return new Response("Not found", {
            status: 404,
            headers: corsHeaders(),
          });
      }
    }

    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders(),
    });
  },
} satisfies ExportedHandler<Env>;

// ====================================================
//   Chat Handler (모든 모델 공통 처리)
// ====================================================
async function handleChatRequest(
  request: Request,
  env: Env,
  modelId: string,
): Promise<Response> {
  try {
    const { messages = [] } = (await request.json()) as {
      messages: ChatMessage[];
    };

    // 시스템 프롬프트 삽입
    if (!messages.some((msg) => msg.role === "system")) {
      messages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    // Cloudflare AI 호출
    const aiResponse = await env.AI.run(
      modelId,
      {
        messages,
        max_tokens: 1024,
      },
      {
        returnRawResponse: true,
      },
    );

    // AI 원시 응답에 CORS 헤더 붙이기
    const headers = new Headers(aiResponse.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

    return new Response(aiResponse.body, {
      status: aiResponse.status,
      headers,
    });

  } catch (err) {
    console.error("Error:", err);

    return new Response(JSON.stringify({ error: "Failed to process request" }), {
      status: 500,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json",
      },
    });
  }
}
