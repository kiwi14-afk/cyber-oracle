/**
 * 前端 SSE 解析器
 * ------------------------------------------------------------------
 * 只依赖 fetch + ReadableStream，不引入任何 SDK：
 * 甲方（评委）可能在完全内网的环境里跑，能少一个依赖就少一个坑。
 * 兼容 OpenAI / 火山方舟 / DeepSeek 的标准 `data: {json}` 格式。
 */

export interface StreamResult {
  mode: "ai" | "local";
  text: string;
  reason?: string;
}

export async function streamChat(
  url: string,
  body: unknown,
  handlers: {
    onDelta?: (delta: string, full: string) => void;
    onMode?: (mode: "ai" | "local", reason?: string) => void;
    signal?: AbortSignal;
  } = {},
): Promise<StreamResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });

  const contentType = res.headers.get("content-type") ?? "";

  // 降级通道：服务端返回 JSON 说明没有 Key 或上游失败
  if (!contentType.includes("text/event-stream")) {
    let mode: "ai" | "local" = "local";
    let reason: string | undefined;
    try {
      const data = (await res.json()) as { mode?: string; reason?: string };
      mode = data.mode === "ai" ? "ai" : "local";
      reason = data.reason;
    } catch {
      reason = `HTTP ${res.status}`;
    }
    handlers.onMode?.(mode, reason);
    return { mode, text: "", reason };
  }

  if (!res.body) {
    handlers.onMode?.("local", "响应没有流");
    return { mode: "local", text: "", reason: "响应没有流" };
  }

  handlers.onMode?.("ai");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 事件以空行分隔；按行解析可以避免把多字节字符切断
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          handlers.onDelta?.(delta, full);
        }
      } catch {
        // 单条坏事件跳过，不整体失败
      }
    }
  }

  return { mode: "ai", text: full };
}
