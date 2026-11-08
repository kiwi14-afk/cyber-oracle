/**
 * 账本聚合层
 * ------------------------------------------------------------------
 * 把流水汇成「一份账单的体检指标」。这里有三条口径必须写清楚（也写进了技术文档）：
 *   1. 资金搬运（转账、还信用卡、余额宝进出）**不算消费**，否则一张信用卡账单
 *      会被还款再消费重复计两遍。
 *   2. 退款一律计为收入，不做「负支出」，保证支出总额单调可解释。
 *   3. 多月份账单只分析流水最多的月份（解析层已过滤），避免「月均」被拉平。
 */

import { CATEGORIES } from "./categories";
import type { CategoryKey, CategoryStat, DayStat, Ledger, SubscriptionItem, Txn } from "./types";

export function daysInMonthOf(month: string): number {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/** 把流水按月份投票，返回流水最多的月份 */
export function dominantMonth(txns: Txn[]): string {
  const counts = new Map<string, number>();
  for (const t of txns) {
    const m = t.date.slice(0, 7);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  for (const [m, c] of counts) {
    if (c > bestCount) {
      best = m;
      bestCount = c;
    }
  }
  return best;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function buildLedger(txns: Txn[], month?: string): Ledger {
  const targetMonth = month ?? dominantMonth(txns);
  const days = daysInMonthOf(targetMonth);
  const [year, monthNum] = targetMonth.split("-").map(Number);
  const scoped = txns.filter((t) => t.date.slice(0, 7) === targetMonth);

  const byDay: DayStat[] = [];
  for (let day = 1; day <= days; day++) {
    const d = new Date(year!, monthNum! - 1, day);
    byDay.push({
      day,
      date: `${targetMonth}-${String(day).padStart(2, "0")}`,
      weekday: d.getDay(),
      expenseCents: 0,
      incomeCents: 0,
      count: 0,
    });
  }

  const byHour = new Array<number>(24).fill(0);
  const categoryMap = new Map<CategoryKey, { cents: number; count: number }>();
  const subMap = new Map<string, SubscriptionItem>();

  let incomeCents = 0;
  let expenseCents = 0;
  let expenseTxnCount = 0;
  let nightCents = 0;
  let nightCount = 0;
  let weekendCents = 0;
  let essentialCents = 0;
  let activeDays = 0;

  const expenses: Txn[] = [];

  for (const t of scoped) {
    const dayIndex = Number(t.date.slice(8, 10)) - 1;
    const cell = byDay[dayIndex];
    if (cell) {
      cell.count += 1;
    }

    if (t.direction === "in") {
      incomeCents += t.amountCents;
      if (cell) cell.incomeCents += t.amountCents;
      continue;
    }

    // 资金搬运不计消费
    if (t.category === "transfer") {
      continue;
    }

    expenses.push(t);
    expenseCents += t.amountCents;
    expenseTxnCount += 1;
    if (cell) cell.expenseCents += t.amountCents;

    const meta = CATEGORIES[t.category];
    if (meta.essential) essentialCents += t.amountCents;

    const cat = categoryMap.get(t.category) ?? { cents: 0, count: 0 };
    cat.cents += t.amountCents;
    cat.count += 1;
    categoryMap.set(t.category, cat);

    const hour = t.hour;
    byHour[hour] = (byHour[hour] ?? 0) + t.amountCents;
    if (hour >= 23 || hour < 5) {
      nightCents += t.amountCents;
      nightCount += 1;
    }

    const weekday = cell ? cell.weekday : 0;
    if (weekday === 0 || weekday === 6) weekendCents += t.amountCents;

    if (t.isSubscription) {
      const item = subMap.get(t.merchantKey) ?? {
        merchantKey: t.merchantKey,
        merchant: t.merchant,
        cents: 0,
        count: 0,
      };
      item.cents += t.amountCents;
      item.count += 1;
      subMap.set(t.merchantKey, item);
    }
  }

  activeDays = byDay.filter((d) => d.count > 0).length;

  const byCategory: CategoryStat[] = [...categoryMap.entries()]
    .map(([key, v]) => ({
      key,
      label: CATEGORIES[key].label,
      essential: CATEGORIES[key].essential,
      cents: v.cents,
      count: v.count,
      share: expenseCents > 0 ? v.cents / expenseCents : 0,
    }))
    .sort((a, b) => b.cents - a.cents);

  const subItems = [...subMap.values()].sort((a, b) => b.cents - a.cents);
  const subCents = subItems.reduce((a, s) => a + s.cents, 0);
  const netCents = incomeCents - expenseCents;

  const amounts = expenses.map((t) => t.amountCents);

  return {
    month: targetMonth,
    daysInMonth: days,
    activeDays,
    txnCount: scoped.length,
    expenseTxnCount,
    incomeCents,
    expenseCents,
    netCents,
    savingRate: incomeCents > 0 ? netCents / incomeCents : 0,
    byCategory,
    byDay,
    byHour,
    nightCents,
    nightCount,
    nightShare: expenseCents > 0 ? nightCents / expenseCents : 0,
    weekendCents,
    essentialCents,
    essentialShare: expenseCents > 0 ? essentialCents / expenseCents : 0,
    subscription: {
      items: subItems,
      // 「几个订阅」按商户去重，同一商户续费两个月只算一个
      count: subItems.length,
      cents: subCents,
      share: expenseCents > 0 ? subCents / expenseCents : 0,
    },
    topExpenses: [...expenses].sort((a, b) => b.amountCents - a.amountCents).slice(0, 5),
    medianExpenseCents: medianOf(amounts),
    maxExpenseCents: amounts.length > 0 ? Math.max(...amounts) : 0,
  };
}
