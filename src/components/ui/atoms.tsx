"use client";

/**
 * 基础视觉原子
 * ------------------------------------------------------------------
 * 全部原子都不写业务逻辑，只负责「墨底 / 朱砂 / 铜金」这套设计语言的落地，
 * 保证卦象、图表、处方三块的间距、圆角、描边完全一致。
 */

import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return <div className={`${flat ? "panel-flat" : "panel"} ${className}`}>{children}</div>;
}

export function SectionHead({
  index,
  title,
  hint,
  right,
}: {
  index: string;
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="label mb-1.5 flex items-center gap-2">
          <span className="text-brass-400/80">{index}</span>
          <span className="h-px w-6 bg-paper-100/15" />
          {hint ? <span className="truncate normal-case tracking-normal text-paper-500">{hint}</span> : null}
        </div>
        <h3 className="font-serif text-lg leading-none text-paper-100">{title}</h3>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "brass" | "cinnabar" | "jade";
  className?: string;
}) {
  const toneClass = {
    neutral: "text-paper-300",
    brass: "text-brass-400 border-brass-500/40 bg-brass-400/10",
    cinnabar: "text-cinnabar-500 border-cinnabar-500/40 bg-cinnabar-500/10",
    jade: "text-jade-400 border-jade-500/40 bg-jade-400/10",
  }[tone];
  return <span className={`chip ${toneClass} ${className}`}>{children}</span>;
}

export function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "default" | "danger" | "good";
}) {
  const valueClass =
    tone === "danger" ? "text-cinnabar-500" : tone === "good" ? "text-jade-400" : "text-paper-100";
  return (
    <div className="min-w-0">
      <div className="label mb-1">{label}</div>
      <div className={`num truncate font-serif text-2xl leading-tight ${valueClass}`}>{value}</div>
      {sub ? <div className="mt-1 truncate text-[11px] text-paper-500">{sub}</div> : null}
    </div>
  );
}

export function Dot({ tone = "brass" }: { tone?: "brass" | "cinnabar" | "jade" }) {
  const cls = tone === "cinnabar" ? "bg-cinnabar-500" : tone === "jade" ? "bg-jade-400" : "bg-brass-400";
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}
