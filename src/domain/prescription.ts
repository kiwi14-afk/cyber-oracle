/**
 * 处方引擎
 * ------------------------------------------------------------------
 * 一条好处方必须同时满足三件事：
 *   ① 有金额（预计每月省多少，来自本账单真实数据，不是拍脑袋）；
 *   ② 有动作（今天就能做的 3 步，不依赖毅力，依赖规则）；
 *   ③ 有证据（引用账单里的具体商户/笔数，让用户相信「这是你的账，不是模板」）。
 * 生成逻辑：按阈值产出候选 → 按「可省金额」排序 → 取 3 条 → 不足 3 条时补通用处方。
 */

import { formatCents } from "./parse/values";
import type { Difficulty, Hexagram, Ledger, Prescription, Runway } from "./types";

interface Ctx {
  ledger: Ledger;
  runway: Runway;
  hexagram: Hexagram;
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function buildPrescriptions(ctx: Ctx): Prescription[] {
  const { ledger, runway } = ctx;
  // 没有支出流水时不开处方：空账上开药等于编故事
  if (ledger.expenseTxnCount === 0) return [];
  const candidates: Prescription[] = [];

  const sub = ledger.subscription;
  if (sub.count > 0 && (sub.count >= 2 || sub.cents >= 5000)) {
    const saving = Math.round(sub.cents * (sub.count > 1 ? 0.7 : 0.3));
    candidates.push({
      id: "subscription-purge",
      title: `清掉 ${Math.max(1, sub.count - 1)} 个「忘了取消」的订阅`,
      oneLiner: `每月 ${formatCents(sub.cents)} 在无人使用的情况下自动离场。`,
      steps: [
        `打开支付宝/微信的「自动扣款」页，逐条核对：${sub.items.slice(0, 3).map((s) => s.merchant).join("、")}`,
        "只保留本月真正用过 3 次以上的那一个，其余当场关闭",
        "保留项的扣款日改到发薪日后第 3 天，别让它在月初挤掉房租",
      ],
      monthlySavingCents: saving,
      difficulty: 1,
      evidence: `${sub.count} 个订阅类商户，当月合计 ${formatCents(sub.cents)}，占支出 ${pct(sub.share)}`,
    });
  }

  if (ledger.nightCents > 0 && (ledger.nightShare >= 0.1 || ledger.nightCents >= 5000)) {
    const saving = Math.round(ledger.nightCents * 0.6);
    const peak = ledger.byHour.indexOf(Math.max(...ledger.byHour));
    candidates.push({
      id: "night-curfew",
      title: "给 23:00 之后的支付装一道门",
      oneLiner: `夜间 ${ledger.nightCount} 笔共 ${formatCents(ledger.nightCents)}，多半不是「需要」而是「顺手」。`,
      steps: [
        "23:00 后关闭小额免密支付 / 关闭指纹支付（让付款多一步输入密码）",
        `把夜间最常下单的店铺取消收藏，账单里花钱最凶的时段是 ${peak} 点`,
        `本月夜间额度定在 ${formatCents(Math.round(ledger.nightCents * 0.4))}，超了就留到第二天白天再买`,
      ],
      monthlySavingCents: saving,
      difficulty: 2,
      evidence: `夜间支出占全月 ${pct(ledger.nightShare)}，共 ${ledger.nightCount} 笔`,
    });
  }

  const food = ledger.byCategory.find((c) => c.key === "food");
  const foodPerDay = food ? Math.round(food.cents / Math.max(1, runway.elapsedDays)) : 0;
  if (food && (food.share >= 0.25 || foodPerDay >= 2500)) {
    const saving = Math.round(food.cents * 0.12);
    candidates.push({
      id: "food-downgrade",
      title: "把外卖换成「食堂 + 自炊」的混合模式",
      oneLiner: `餐饮日均 ${formatCents(foodPerDay)}，一周的差价就是一张回家的车票。`,
      steps: [
        `先只改 3 天：一周挑 3 个工作日吃食堂或自炊，其余不变`,
        `记下这 3 天省下的钱，直接转进储蓄（${formatCents(saving)} 是整月的目标量）`,
        "把外卖 App 的「满减券」关掉：券是让你多点一份的工具，不是省钱工具",
      ],
      monthlySavingCents: saving,
      difficulty: 2,
      evidence: `餐饮 ${formatCents(food.cents)}，占支出 ${pct(food.share)}，日均 ${formatCents(foodPerDay)}`,
      related: "food",
    });
  }

  const entertainment = ledger.byCategory.find((c) => c.key === "entertainment");
  if (entertainment && entertainment.share >= 0.08) {
    const saving = Math.round(entertainment.cents * 0.3);
    candidates.push({
      id: "entertainment-cap",
      title: "给娱乐设一个「封顶数」，花完就停",
      oneLiner: `娱乐 ${formatCents(entertainment.cents)}，是最好砍、也最不痛的一块。`,
      steps: [
        `把娱乐预算定为 ${formatCents(Math.round(entertainment.cents * 0.7))}（本月实际 × 0.7）`,
        "娱乐支出只用一张单独的卡/零钱，花完不充值，避免和饭钱混在一起",
        "把「想去的展/想玩的游戏」列成清单，月底按预算挑一个，而不是随手买",
      ],
      monthlySavingCents: saving,
      difficulty: 2,
      evidence: `娱乐 ${formatCents(entertainment.cents)}，占支出 ${pct(entertainment.share)}，共 ${entertainment.count} 笔`,
      related: "entertainment",
    });
  }

  const shopping = ledger.byCategory.find((c) => c.key === "shopping");
  if (shopping && shopping.share >= 0.12) {
    const saving = Math.round(shopping.cents * 0.25);
    candidates.push({
      id: "shopping-cooldown",
      title: "给非必需品加 72 小时冷静期",
      oneLiner: `购物 ${formatCents(shopping.cents)}，其中至少四分之一是「当时觉得需要」。`,
      steps: [
        "把购物车里的东西先移到收藏夹，三天后再决定；三天后还想要，再买",
        "取消所有「先享后付 / 分期免息」的默认勾选，只留余额支付",
        `本月购物上限 ${formatCents(Math.round(shopping.cents * 0.75))}，超出部分记到「下月想买」清单`,
      ],
      monthlySavingCents: saving,
      difficulty: 3,
      evidence: `购物 ${formatCents(shopping.cents)}，${shopping.count} 笔，占支出 ${pct(shopping.share)}`,
      related: "shopping",
    });
  }

  const social = ledger.byCategory.find((c) => c.key === "social");
  if (social && social.share >= 0.06) {
    candidates.push({
      id: "social-budget",
      title: "人情支出改成「月度池」，一次配好",
      oneLiner: `人情 ${formatCents(social.cents)}，是唯一「不好拒绝」的支出，所以要提前配。`,
      steps: [
        `月初一次性划出 ${formatCents(Math.round(social.cents * 0.8))} 作为人情池`,
        "超出池子的邀约，用「这周预算已经排满」直接拒绝，不用解释",
        "把聚会的默认动作从「我请」改成「AA」，一次能省 40% 以上",
      ],
      monthlySavingCents: Math.round(social.cents * 0.2),
      difficulty: 2,
      evidence: `人情 ${formatCents(social.cents)}，占支出 ${pct(social.share)}`,
      related: "social",
    });
  }

  if (ledger.incomeCents > 0 && ledger.savingRate < 0.15) {
    const target = Math.round(ledger.incomeCents * 0.15);
    const saving = Math.min(target, Math.max(0, target - ledger.netCents));
    candidates.push({
      id: "pay-yourself-first",
      title: "把「先存后花」改成自动动作",
      oneLiner: `结余率 ${(ledger.savingRate * 100).toFixed(1)}%，不是赚得少，是顺序错了。`,
      steps: [
        `发薪日当天自动转出 ${formatCents(target)} 到一张不绑支付的卡（先存后花）`,
        "这张卡不装在任何支付 App 里，取现要跑银行——增加摩擦就是保护",
        `把剩下的 ${formatCents(ledger.incomeCents - target)} 当作本月全部可花额度`,
      ],
      monthlySavingCents: Math.max(saving, Math.round(target * 0.5)),
      difficulty: 2,
      evidence: `收入 ${formatCents(ledger.incomeCents)}，支出 ${formatCents(ledger.expenseCents)}，净 ${formatCents(ledger.netCents)}`,
    });
  }

  // 兜底处方：保证至少 3 条
  if (candidates.length < 3) {
    candidates.push({
      id: "week-cash-challenge",
      title: "试一周「现金信封」挑战",
      oneLiner: `日均 ${formatCents(runway.dailyBurnCents)}，一周就是 ${formatCents(runway.dailyBurnCents * 7)}。`,
      steps: [
        `本周只带 ${formatCents(Math.round(runway.dailyBurnCents * 5))} 的现金（相当于砍掉 2 天）`,
        "线上支付 App 本周不解锁，急用才开",
        "周末复盘：哪一天最容易破戒，就把那一天的场景写进下个月的规则",
      ],
      monthlySavingCents: Math.round(runway.dailyBurnCents * 7 * 0.25),
      difficulty: 1,
      evidence: `按日均 ${formatCents(runway.dailyBurnCents)} 推算，一周可省约 ${formatCents(Math.round(runway.dailyBurnCents * 7 * 0.25))}`,
    });
  }
  if (candidates.length < 3) {
    candidates.push({
      id: "idle-resale",
      title: "清一次闲置，把「沉没成本」变回现金",
      oneLiner: "上个月买的东西，这个月还在吃灰的，就是最好的现金流来源。",
      steps: [
        "挑 3 件 30 天没用过的物品挂二手平台，标价按原价 4 折起",
        "卖掉的钱全部转入「不绑支付」的储蓄卡，不许回流消费",
        "卖不掉的就送人/捐掉：留着只会继续占你的心理空间",
      ],
      monthlySavingCents: 20000,
      difficulty: 1,
      evidence: "一次性回血，按 3 件 × 约 ¥67 估算（保守值）",
    });
  }

  const ranked = candidates.sort((a, b) => b.monthlySavingCents - a.monthlySavingCents);
  const picked: Prescription[] = [];
  const idSeen = new Set<string>();
  for (const p of ranked) {
    if (idSeen.has(p.id)) continue;
    idSeen.add(p.id);
    picked.push(p);
    if (picked.length === 3) break;
  }
  return picked;
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: "今天就能做",
  2: "需要一点规则",
  3: "需要换习惯",
};
