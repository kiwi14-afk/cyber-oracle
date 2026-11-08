/**
 * POST /api/chat —— 追问对话（流式）
 * ------------------------------------------------------------------
 * 与 /api/oracle 共用一套边界：只发卦案信封，不发原始流水；
 * 问题长度上限 300 字，历史只带最近 4 轮，避免上下文膨胀与跑题。
 */

import { CHAT_SYSTEM_PROMPT, buildChatUserPrompt } from "@/lib/ai/prompts";
import type { OraclePayload } from "@/lib/ai/payload";
import { readAiConfig, streamCompletion, UpstreamError } from "@/lib/ai/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  payload?: OraclePayload;
  history?: Array<{ role: string; content: string }>;
  question?: string;
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ mode: "local", reason: "请求体不是合法 JSON" }, { status: 400 });
  }

  const question = (body.question ?? "").trim().slice(0, 300);
  if (!question) {
    return Response.json({ mode: "local", reason: "问题为空" }, { status: 400 });
  }
  if (!body.payload || body.payload.v !== 1) {
    return Response.json({ mode: "local", reason: "缺少卦案信封" }, { status: 400 });
  }

  const config = readAiConfig();
  if (!config) {
    return Response.json({ mode: "local" });
  }

  const history = Array.isArray(body.history)
    ? body.history
        .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 600) }))
    : [];

  try {
    const stream = await streamCompletion(
      config,
      [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        { role: "user", content: buildChatUserPrompt(body.payload, history, question) },
      ],
      { maxTokens: 400, temperature: 0.5 },
    );

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Oracle-Mode": "ai",
      },
    });
  } catch (err) {
    const message = err instanceof UpstreamError ? err.message : "未知错误";
    return Response.json({ mode: "local", reason: message }, { status: 200 });
  }
}
