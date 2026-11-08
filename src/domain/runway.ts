/**
 * 现金流燃尽引擎（Runway）
 * ------------------------------------------------------------------
 * 解决的问题：大多数记账 App 只告诉你「花了多少」，但真正让人焦虑的是
 * 「我这个月还能撑几天」。这里用「已过天数 → 日均燃烧率 → 外推」的三步法，
 * 给出确定的燃尽日，并且把口径写进文案里（预算从哪来、日均怎么算），
 * 避免出现「AI 拍脑袋预测」的不可信结论。
 */

import type { DayStat, Ledger, OracleOptions, Runway, RunwayPoint } from "./types";

/** 取中位数：比平均数更抗「一笔房租」的干扰 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

export function buildRunway(ledger: Ledger, options: OracleOptions = {}): Runway {
  const { daysInMonth, byDay, expenseCents } = ledger;

  // 已过天数 = 最后一笔流水所在的那一天；如果一个月的流水都在月初，不能按 30 天摊
  const lastActiveDay = byDay.reduce((acc, d) => (d.count > 0 ? Math.max(acc, d.day) : acc), 1);
  const elapsedDays = Math.max(1, lastActiveDay);

  // 日均燃烧率：优先用「有过消费的天」的中位数，避免月末大额房租把均值拉爆
  const activeSpends = byDay.filter((d) => d.count > 0).map((d) => d.expenseCents);
  const dailyBurnCents =
    activeSpends.length > 0 ? median(activeSpends) : Math.round(expenseCents / Math.max(1, elapsedDays));

  let budgetCents: number;
  let budgetSource: Runway["budgetSource"];
  if (options.budgetCentsOverride && options.budgetCentsOverride > 0) {
    budgetCents = options.budgetCentsOverride;
    budgetSource = "custom";
  } else if (ledger.incomeCents > 0) {
    budgetCents = ledger.incomeCents;
    budgetSource = "income";
  } else {
    // 没有收入记录：用本月支出当作「可用额度」，此时不出燃尽结论，只画曲线
    budgetCents = Math.max(expenseCents, 1);
    budgetSource = "expense";
  }

  const safeDailyCents = Math.round(budgetCents / daysInMonth);

  // 实际累计
  const cumulative = buildCumulative(byDay, daysInMonth);

  // 找实际已经烧穿的那一天
  let actualBurnDay: number | null = null;
  for (const point of cumulative) {
    if (point.cents > budgetCents) {
      actualBurnDay = point.day;
      break;
    }
  }

  // 外推：用中线速率把剩余天数补完
  const anchor = cumulative[cumulative.length - 1]!;
  const points: RunwayPoint[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const actual = day <= elapsedDays ? cumulative[day - 1]!.cents : null;
    const projected =
      day <= elapsedDays ? cumulative[day - 1]!.cents : anchor.cents + dailyBurnCents * (day - elapsedDays);
    points.push({
      day,
      date: cumulative[day - 1]!.date,
      actualCents: actual,
      projectedCents: projected,
    });
  }

  // 燃尽日：优先取实际（已发生），否则取外推里第一个超预算的日子
  let burnoutDay: number | null = actualBurnDay;
  if (burnoutDay === null) {
    for (const p of points) {
      if (p.projectedCents > budgetCents) {
        burnoutDay = p.day;
        break;
      }
    }
  }

  return {
    budgetCents,
    budgetSource,
    elapsedDays,
    daysInMonth,
    dailyBurnCents,
    safeDailyCents,
    projectedTotalCents: points[points.length - 1]!.projectedCents,
    burnoutDay,
    alreadyOver: actualBurnDay !== null,
    points,
  };
}

function buildCumulative(byDay: DayStat[], daysInMonth: number): Array<{ day: number; date: string; cents: number }> {
  let running = 0;
  const out: Array<{ day: number; date: string; cents: number }> = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const stat = byDay[day - 1];
    running += stat ? stat.expenseCents : 0;
    out.push({ day, date: stat ? stat.date : "", cents: running });
  }
  return out;
}
