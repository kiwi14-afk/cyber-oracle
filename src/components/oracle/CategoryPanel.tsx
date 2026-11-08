"use client";

/**
 * 分类结构 + 收支摘要
 * ------------------------------------------------------------------
 * 不做饼图：饼图在 12 个分类下几乎不可读，横条更适合比较。
 * 必需类用薄荷青，可选类用铜金，订阅用朱砂——三种颜色直接对应「底盘 / 弹性 / 漏水」。
 */

import type { Ledger } from "@/domain/types";
import { formatCents } from "@/domain/parse/values";
import { SectionHead } from "@/components/ui/atoms";

export function CategoryPanel({ ledger }: { ledger: Ledger }) {
  const list = ledger.byCategory.slice(0, 6);
  const max = Math.max(...list.map((c) => c.cents), 1);

  return (
    <div>
      <SectionHead index="03" title="钱花在哪一层" hint={`共 ${ledger.expenseTxnCount} 笔支出`} right={<span className="num text-xs text-paper-500">{formatCents(ledger.expenseCents)}</span>} />

      <div className="space-y-3">
        {list.map((c) => {
          const tone =
            c.key === "subscription"
              ? "bg-cinnabar-500/70"
              : c.essential
                ? "bg-jade-400/70"
                : "bg-brass-400/70";
          return (
            <div key={c.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-paper-300">
                  <span className="truncate">{c.label}</span>
                  {c.essential ? <span className="text-[10px] text-jade-400/70">必需</span> : null}
                  <span className="text-[10px] text-paper-600">{c.count} 笔</span>
                </span>
                <span className="num shrink-0 whitespace-nowrap text-xs text-paper-100">
                  {formatCents(c.cents)}
                  <span className="ml-2 text-[10px] text-paper-500">{(c.share * 100).toFixed(1)}%</span>
                </span>
              </div>
              <div className="h-[5px] w-full overflow-hidden rounded-full bg-paper-100/[0.06]">
                <div
                  className={`h-full origin-left rounded-full ${tone}`}
                  style={{ width: `${Math.max(2, (c.cents / max) * 100)}%`, animation: "growX 0.9s cubic-bezier(0.16,1,0.3,1) both" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-paper-100/10 pt-4">
        <div>
          <div className="text-[10px] text-paper-600">必需占比</div>
          <div className="num mt-0.5 text-sm text-jade-400">{(ledger.essentialShare * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[10px] text-paper-600">夜间消费</div>
          <div className="num mt-0.5 text-sm text-paper-100">{ledger.nightCount} 笔</div>
          <div className="text-[10px] text-paper-600">{formatCents(ledger.nightCents)}</div>
        </div>
        <div>
          <div className="text-[10px] text-paper-600">订阅月供</div>
          <div className="num mt-0.5 text-sm text-cinnabar-500">{formatCents(ledger.subscription.cents)}</div>
          <div className="text-[10px] text-paper-600">{ledger.subscription.count} 项</div>
        </div>
      </div>
    </div>
  );
}
