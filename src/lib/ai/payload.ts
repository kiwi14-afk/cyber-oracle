/**
 * 送给模型的数据信封
 * ------------------------------------------------------------------
 * 为什么不让模型直接读原始流水：
 *   1. 隐私：原始商户 + 金额是最敏感的部分，能不出浏览器就不出；
 *   2. 准确性：模型算账不可靠，账必须由本地引擎算完，模型只负责「讲」；
 *   3. 成本与延迟：一封信封 1KB 左右，比几百行账单便宜得多。
 *
 * 信封里的所有数字都带上「已格式化」的字符串（如 ¥1,367.90、24.3%），
 * 提示词会要求模型**只能引用这些字符串**，从源头压掉数字幻觉。
 */

import { formatCents } from "@/domain/parse/values";
import type { OracleResult } from "@/domain/types";

export interface OraclePayload {
  v: 1;
  month: string;
  income: string;
  expense: string;
  net: string;
  savingRate: string;
  essentialShare: string;
  emotional: { amount: string; share: string };
  night: { count: number; amount: string; share: string };
  subscriptions: { count: number; amount: string; items: string[]; share: string };
  categories: Array<{ label: string; amount: string; share: string; count: number }>;
  hexagram: {
    id: number;
    name: string;
    symbol: string;
    leakCount: number;
    judgement: string;
    lines: Array<{ position: string; yin: boolean; value: string; text: string }>;
  };
  persona: { name: string; tagline: string; description: string };
  runway: {
    budget: string;
    dailyBurn: string;
    burnout: string;
    daysInMonth: number;
    elapsedDays: number;
    budgetSource: string;
  };
  prescriptions: Array<{ title: string; saving: string; oneLiner: string; steps: string[]; evidence: string }>;
  top: Array<{ label: string; amount: string; date: string; category: string }>;
}

export function toPayload(result: OracleResult): OraclePayload {
  const { ledger, hexagram, persona, runway, prescriptions } = result;

  const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

  const emotionalCents = ledger.byCategory
    .filter((c) => c.key === "shopping" || c.key === "entertainment")
    .reduce((a, c) => a + c.cents, 0);

  return {
    v: 1,
    month: ledger.month,
    income: formatCents(ledger.incomeCents),
    expense: formatCents(ledger.expenseCents),
    net: formatCents(ledger.netCents, { sign: true }),
    savingRate: pct(ledger.savingRate),
    essentialShare: pct(ledger.essentialShare, 0),
    emotional: {
      amount: formatCents(emotionalCents),
      share: pct(ledger.expenseCents > 0 ? emotionalCents / ledger.expenseCents : 0),
    },
    night: { count: ledger.nightCount, amount: formatCents(ledger.nightCents), share: pct(ledger.nightShare, 0) },
    subscriptions: {
      count: ledger.subscription.count,
      amount: formatCents(ledger.subscription.cents),
      items: ledger.subscription.items.slice(0, 6).map((s) => s.merchant),
      share: pct(ledger.subscription.share),
    },
    categories: ledger.byCategory.slice(0, 6).map((c) => ({
      label: c.label,
      amount: formatCents(c.cents),
      share: pct(c.share),
      count: c.count,
    })),
    hexagram: {
      id: hexagram.id,
      name: hexagram.name,
      symbol: hexagram.symbol,
      leakCount: hexagram.leakCount,
      judgement: hexagram.judgement,
      lines: hexagram.lines.map((l) => ({
        position: l.position,
        yin: !l.yang,
        value: l.display,
        text: l.text,
      })),
    },
    persona: { name: persona.name, tagline: persona.tagline, description: persona.description },
    runway: {
      budget: formatCents(runway.budgetCents),
      dailyBurn: formatCents(runway.dailyBurnCents),
      burnout: runway.burnoutDay ? `第 ${runway.burnoutDay} 天` : "不会见底",
      daysInMonth: runway.daysInMonth,
      elapsedDays: runway.elapsedDays,
      budgetSource: runway.budgetSource,
    },
    prescriptions: prescriptions.map((p) => ({
      title: p.title,
      saving: formatCents(p.monthlySavingCents),
      oneLiner: p.oneLiner,
      steps: p.steps,
      evidence: p.evidence,
    })),
    top: ledger.topExpenses.slice(0, 3).map((t) => ({
      label: t.note ? `${t.merchant} · ${t.note}` : t.merchant,
      amount: formatCents(t.amountCents),
      date: t.date,
      category: t.category,
    })),
  };
}
