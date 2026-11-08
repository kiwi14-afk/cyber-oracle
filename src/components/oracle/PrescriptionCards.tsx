"use client";

/**
 * 人格卡 + 三剂处方
 * ------------------------------------------------------------------
 * 人格卡的写法刻意避开「你很棒 / 你要加油」这类空话：
 * 每一条 traits 都必须能被账单里的数字复述，否则不许写进来。
 */

import type { Persona, Prescription } from "@/domain/types";
import { formatCents } from "@/domain/parse/values";
import { Dot } from "@/components/ui/atoms";

export function PersonaCard({ persona, verdict }: { persona: Persona; verdict: string }) {
  return (
    <div>
      <div className="label mb-2">本月人格</div>
      <h3 className="font-serif text-3xl leading-tight text-gradient-brass">{persona.name}</h3>
      <p className="mt-2 text-sm text-paper-300">{persona.tagline}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-paper-500">{persona.description}</p>

      <ul className="mt-4 space-y-1.5">
        {persona.traits.map((t) => (
          <li key={t} className="flex gap-2 text-[12px] leading-relaxed text-paper-300">
            <span className="mt-[7px]"><Dot tone="brass" /></span>
            <span className="min-w-0">{t}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-paper-100/10 pt-3 text-[12px] leading-relaxed text-paper-500">{verdict}</p>
    </div>
  );
}

const DIFFICULTY_TEXT: Record<number, string> = { 1: "难度 1 · 今天就能做", 2: "难度 2 · 需要一点规则", 3: "难度 3 · 需要换习惯" };

export function PrescriptionCards({ prescriptions }: { prescriptions: Prescription[] }) {
  const total = prescriptions.reduce((a, p) => a + p.monthlySavingCents, 0);

  if (prescriptions.length === 0) {
    return (
      <div className="rounded-xl2 border border-paper-100/10 bg-ink-800/40 px-5 py-6 text-sm text-paper-500">
        这份账单没有可开处方的支出流水。先确认导出的是「交易明细」而不是「收入证明」。
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="label">三剂处方</span>
        <span className="text-xs text-paper-500">
          合计可省 <span className="num text-base text-jade-400">{formatCents(total)}</span> / 月
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {prescriptions.map((p, i) => (
          <div
            key={p.id}
            className="group relative flex flex-col overflow-hidden rounded-xl2 border border-paper-100/10 bg-ink-800/45 p-4 transition-colors hover:border-brass-400/30"
            style={{ animation: `riseIn 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 90}ms both` }}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="num font-serif text-lg text-brass-400/70">0{i + 1}</span>
              <span className="num shrink-0 rounded-md border border-jade-500/30 bg-jade-400/[0.08] px-2 py-0.5 text-[11px] text-jade-400">
                省 {formatCents(p.monthlySavingCents)}
              </span>
            </div>

            <h4 className="font-serif text-base leading-snug text-paper-100">{p.title}</h4>
            <p className="mt-1.5 text-[12px] leading-relaxed text-paper-500">{p.oneLiner}</p>

            <ol className="mt-3 space-y-1.5 border-t border-paper-100/10 pt-3">
              {p.steps.map((s, idx) => (
                <li key={idx} className="flex gap-2 text-[12px] leading-relaxed text-paper-300">
                  <span className="num shrink-0 text-paper-600">{idx + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>

            <div className="mt-auto pt-3 text-[11px] leading-relaxed text-paper-600">
              <span className="text-paper-500">依据：</span>
              {p.evidence}
            </div>
            <div className="mt-2 text-[10px] text-paper-600">{DIFFICULTY_TEXT[p.difficulty]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
