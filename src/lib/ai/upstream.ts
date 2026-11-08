/**
 * 上游模型调用（服务端专用）
 * ------------------------------------------------------------------
 * 只认 OpenAI 兼容的 /chat/completions 协议，因此豆包方舟、DeepSeek、智谱、
 * OpenAI 之间切换只需要改三个环境变量，不需要改代码。
 *
 * 安全约束：
 *   · API Key 只出现在服务端环境变量里，永远不进 client bundle；
 *   · 请求体只接受已聚合的「卦案信封」，不接收原始流水；
 *   · 超时 45s，超时即失败，由前端降级到本地卦辞，绝不挂起页面。
 */

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function readAiConfig(): AiConfig | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  if (!apiKey || !model) return null;
  const baseUrl = (process.env.AI_BASE_URL?.trim() || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  return { baseUrl, apiKey, model };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class UpstreamError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

/**
 * 发起流式补全。成功返回上游的 ReadableStream（SSE），失败抛出 UpstreamError。
 * 注意：不在这里解析内容，解析交给前端——服务端只做鉴权与转发，保持薄。
 */
export async function streamCompletion(
  config: AiConfig,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<ReadableStream<Uint8Array>> {
  const url = `${config.baseUrl}/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: true,
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 700,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    throw new UpstreamError(`上游连接失败：${(err as Error).message}`, 504);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new UpstreamError(`上游返回 ${res.status}：${detail.slice(0, 200)}`, res.status === 401 ? 401 : 502);
  }
  if (!res.body) throw new UpstreamError("上游没有返回流式内容", 502);

  return res.body;
}
