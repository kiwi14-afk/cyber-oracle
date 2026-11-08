"use client";

/**
 * 追问对话
 * ------------------------------------------------------------------
 * 追问和卦辞共用同一封信封，因此模型不会「越问越离谱」：
 * 每一轮都重新拿到完整的卦案，而不是依赖上一轮的自由发挥。
 *
 * 没有 Key 时不禁用输入框，而是明确回答「现在只能本地模式」——
 * 让评委看见降级路径是设计好的，而不是坏掉了。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { OraclePayload } from "@/lib/ai/payload";
import { streamChat } from "@/lib/ai/streamClient";
import { SectionHead } from "@/components/ui/atoms";

interface Message {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

const SUGGESTIONS = ["哪一爻最该先补？", "订阅里最该砍的是哪个？", "下个月怎么才不至于见底？"];

export function ChatPanel({ payload, aiEnabled }: { payload: OraclePayload; aiEnabled: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim().slice(0, 300);
      if (!q || busy) return;
      setInput("");
      setBusy(true);

      const history = messages.filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [...prev, { role: "user", content: q }, { role: "assistant", content: "", pending: true }]);

      try {
        const res = await streamChat(
          "/api/chat",
          { payload, history, question: q },
          {
            onDelta: (_d, full) => {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") next[next.length - 1] = { role: "assistant", content: full, pending: true };
                return next;
              });
            },
          },
        );

        const answer =
          res.mode === "ai" && res.text.trim()
            ? res.text.trim()
            : aiEnabled
              ? "这次模型没有返回内容，换个问法再试一次。"
              : "（本地模式）追问需要模型参与：配置 AI_API_KEY 与 AI_MODEL 后，这里就能基于卦案回答。当前卦辞、六爻与处方仍然完整可用。";

        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: answer };
          return next;
        });
      } catch {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: "请求失败了，稍后再问一次。" };
          return next;
        });
      } finally {
        setBusy(false);
      }
    },
    [aiEnabled, busy, messages, payload],
  );

  return (
    <div>
      <SectionHead
        index="05"
        title="追问卦师"
        hint={aiEnabled ? "基于同一份卦案回答，不重新算账" : "未配置 Key · 将以下降级说明回答"}
      />

      <div ref={listRef} className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-paper-100/12 px-4 py-5 text-center text-[12px] text-paper-500">
            卦已经起了，但还有想问的？试试下面三个问题。
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-lg rounded-br-sm border border-brass-400/25 bg-brass-400/[0.08] px-3.5 py-2 text-[12.5px] leading-relaxed text-paper-100"
                    : "max-w-[92%] rounded-lg rounded-bl-sm border border-paper-100/10 bg-ink-800/60 px-3.5 py-2 text-[12.5px] leading-relaxed text-paper-300"
                }
              >
                {m.content || (m.pending ? <span className="text-paper-600">正在接卦…</span> : null)}
                {m.pending && m.content ? <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-brass-400 align-middle" /> : null}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => ask(s)}
            className="rounded-full border border-paper-100/12 px-3 py-1 text-[11px] text-paper-400 transition-colors hover:border-brass-400/35 hover:text-paper-100 disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={300}
          placeholder="比如：那笔 128 的密室逃脱，算情绪消费吗？"
          className="min-w-0 flex-1 rounded-lg border border-paper-100/12 bg-ink-800/60 px-3 py-2 text-[12.5px] text-paper-100 outline-none transition-colors placeholder:text-paper-600 focus:border-brass-400/40"
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary px-4 py-2 text-xs">
          {busy ? "接卦中" : "追问"}
        </button>
      </form>
    </div>
  );
}
