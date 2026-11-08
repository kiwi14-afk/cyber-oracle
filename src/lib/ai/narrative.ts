/**
 * 本地卦辞（无 Key 模式）
 * ------------------------------------------------------------------
 * 这段文字完全由本地数据拼装，不经过任何模型：
 *   · 评委没有 API Key 也能看到完整、可信、带数字的解读；
 *   · 同时它是 AI 输出的「对照组」——如果模型讲了本地没写的数字，就能一眼看出幻觉。
 */

import type { OraclePayload } from "./payload";

export interface Narrative {
  mode: "local" | "ai";
  title: string;
  paragraphs: string[];
}

export function localNarrative(p: OraclePayload): Narrative {
  const yinLines = p.hexagram.lines.filter((l) => l.yin);
  const worst = yinLines[0];

  const paragraphs: string[] = [];

  // ① 一句断语
  const verdict =
    p.hexagram.id === 0
      ? "这份账单没有支出流水，卦象暂缺。"
      : `${p.persona.name}，${p.runway.burnout === "不会见底" ? "这个月能收得住" : `预算在${p.runway.burnout}见底`}。`;
  paragraphs.push(verdict);

  // ② 最疼的一爻
  if (worst) {
    paragraphs.push(`${worst.position}是这一卦里最先开裂的地方：${worst.text}这一爻不补，其它爻补了也会漏回去。`);
  } else if (p.hexagram.id !== 0) {
    paragraphs.push(
      `六爻皆阳，取象「${p.hexagram.name}」。这个月的账没有明显缺口，支出 ${p.expense}、收入 ${p.income}、结余率 ${p.savingRate}。真正要防的是「觉得没事」之后的松懈，不是超支本身。`,
    );
  }

  // ③ 燃尽与结构
  paragraphs.push(
    `按日均 ${p.runway.dailyBurn} 的节奏推算，预算 ${p.runway.budget}（${p.runway.budgetSource === "custom" ? "你手填的额度" : p.runway.budgetSource === "income" ? "按本月收入推算" : "按本月支出反推"}）会在${p.runway.burnout === "不会见底" ? "月底前留有余量" : `${p.runway.burnout}被烧穿`}。桌上最贵的三笔是：${p.top
      .map((t) => `${t.label}（${t.amount}）`)
      .join("、")}。`,
  );

  // ④ 今天就能做的动作
  const first = p.prescriptions[0];
  paragraphs.push(
    first
      ? `今天就能做的只有一件事：${first.steps[0]}。这条动作预计每月省下 ${first.saving}——先做这一条，别一次改四件事。`
      : "没有可执行的处方：这份账单缺少支出流水，先换一份完整的交易明细。",
  );

  return { mode: "local", title: `${p.hexagram.symbol} ${p.hexagram.name}`, paragraphs };
}
