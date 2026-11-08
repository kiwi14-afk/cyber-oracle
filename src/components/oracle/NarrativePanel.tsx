"use client";

/**
 * 卦辞面板（AI 流式 / 本地兜底）
 * ------------------------------------------------------------------
 * 体验设计上的一个取巧：**先在本地把卦辞写出来，AI 回来后再逐字替换**。
 *  - 没有 Key：用户看到的是完整、带数字的本地卦辞，不是「请配置 API Key」；
 *  - 有 Key：文字从本地版本平滑切换成模型版本，不会出现空白等待；
 *  - 上游挂了：退回本地版本，并在角落标明原因，而不是弹一个红色错误框。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OraclePayload } from "@/lib/ai/payload";
import { localNarrative } from "@/lib/ai/narrative";
import { streamChat } from "@/lib/ai/streamClient";
import { Chip, SectionHead } from "@/components/ui/atoms";

interface Props {
  payload: OraclePayload;
  onModeChange?: (mode: "ai" | "local") => void;
}

export function NarrativePanel({ payload, onModeChange }: Props) {
  const local = useMemo(() => localNarrative(payload), [payload]);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"pending" | "ai" | "local">("pending");
  const [reason, setReason] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setText("");
    setReason(undefined);
    setMode("pending");

    (async () => {
      try {
        const res = await streamChat(
          "/api/oracle",
          { payload },
          {
            signal: controller.signal,
            onDelta: (_d, full) => setText(full),
            onMode: (m, why) => {
              setMode(m);
              setReason(why);
              onModeChange?.(m);
            },
          },
        );
        if (res.mode === "local") {
          setMode("local");
          setReason(res.reason);
          onModeChange?.("local");
        } else if (res.text.trim().length === 0) {
          setMode("local");
          setReason("上游返回了空内容");
          onModeChange?.("local");
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setMode("local");
        setReason((err as Error).message);
        onModeChange?.("local");
      }
    })();

    return () => controller.abort();
  }, [payload, nonce, onModeChange]);

  const showingAi = mode === "ai" && text.trim().length > 0;
  const paragraphs = showingAi ? text.split(/\n+/).filter(Boolean) : local.paragraphs;
  const totalChars = paragraphs.join("").length;

  const copy = useCallback(async () => {
    const body = `【${local.title}】\n\n${paragraphs.join("\n\n")}`;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [paragraphs, local.title]);

  return (
    <div className="flex h-full flex-col">
      <SectionHead
        index="04"
        title="卦辞"
        hint={showingAi ? "模型正在按卦案讲解" : mode === "pending" ? "正在接通模型" : "本地确定性文案"}
        right={
          <div className="flex items-center gap-2">
            <Chip tone={showingAi ? "brass" : "neutral"}>
              <span className="flex items-center gap-1.5">
                {mode === "pending" ? <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-paper-400" /> : null}
                {showingAi ? "AI 卦辞" : mode === "pending" ? "请求中" : "本地卦辞"}
              </span>
            </Chip>
            <button type="button" onClick={copy} className="text-[11px] text-paper-500 transition-colors hover:text-paper-100">
              {copied ? "已复制" : "复制"}
            </button>
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              className="text-[11px] text-paper-500 transition-colors hover:text-paper-100"
            >
              重讲一次
            </button>
          </div>
        }
      />

      <div className="min-h-[180px] flex-1 space-y-3">
        {paragraphs.map((p, i) => (
          <p
            key={i}
            className={`text-[13.5px] leading-[1.9] ${i === 0 ? "font-serif text-lg leading-relaxed text-paper-100" : "text-paper-300"}`}
          >
            {p}
            {showingAi && i === paragraphs.length - 1 ? (
              <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-brass-400 align-middle" />
            ) : null}
          </p>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-paper-100/10 pt-2 text-[10px] text-paper-600">
        <span>
          {showingAi ? `流式输出 · 已收到 ${totalChars} 字` : "本地拼装 · 不经过任何模型"}
          {reason ? ` · ${reason.slice(0, 80)}` : ""}
        </span>
        <span>数字一律取自卦案信封</span>
      </div>
    </div>
  );
}