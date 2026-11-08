/**
 * POST /api/oracle —— 生成卦辞（流式）
 * ------------------------------------------------------------------
 * 有 Key：转发上游 SSE，前端边收边排版。
 * 无 Key 或上游失败：返回 { mode: "local" }，前端退回本地卦辞。
 * 这个「双通道」设计是本项目能在评委电脑上零配置跑通的关键。
 */

import { ORACLE_SYSTEM_PROMPT, buildOracleUserPrompt } from "@/lib/ai/prompts";
import type { OraclePayload } from "@/lib/ai/payload";
import { readAiConfig, streamCompletion, UpstreamError } from "@/lib/ai/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPayload(value: unknown): value is OraclePayload {
  if (!value || typeof value !== "object") return false;
  const p = value as OraclePayload;
  return p.v === 1 && typeof p.month === "string" && Boolean(p.hexagram) && Array.isArray(p.prescriptions);
}

export async function POST(request: Request) {
  let body: { payload?: unknown };
  try {
    body = (await request.json()) as { payload?: unknown };
  } catch {
    return Response.json({ mode: "local", reason: "请求体不是合法 JSON" }, { status: 400 });
  }

  if (!isPayload(body.payload)) {
    return Response.json({ mode: "local", reason: "卦案信封格式不正确" }, { status: 400 });
  }

  const config = readAiConfig();
  if (!config) {
    // 没有 Key 不是错误，是本项目默认支持的「本地模式」
    return Response.json({ mode: "local" });
  }

  try {
    const stream = await streamCompletion(
      config,
      [
        { role: "system", content: ORACLE_SYSTEM_PROMPT },
        { role: "user", content: buildOracleUserPrompt(body.payload) },
      ],
      { maxTokens: 800, temperature: 0.65 },
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
