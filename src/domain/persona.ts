/**
 * 消费人格
 * ------------------------------------------------------------------
 * 人格不是「贴标签」，而是把卦象翻译成一句能记住的自述：
 *   哪一个爻漏得最疼 → 你就是那一种人；再加两条真实数据当证据。
 * 规则全量枚举，保证同一份账单得到同一人格（可被单测断言）。
 */

import { formatCents } from "./parse/values";
import { LINE_META } from "./hexagram";
import type { Hexagram, Ledger, Persona } from "./types";

interface PersonaDef {
  key: string;
  name: string;
  tagline: string;
  description: string;
}

const BY_LINE: Record<number, PersonaDef> = {
  1: {
    key: "floating-base",
    name: "浮基生存家",
    tagline: "先买快乐，再想办法活到月底。",
    description:
      "你的必需开支被可选消费挤薄了：吃住行这些撑住你的东西占比偏低，说明钱是先花在「想要」上、剩下的才给「必须」。这类结构最怕一次意外支出——因为底盘本来就没打厚。",
  },
  2: {
    key: "emotion-checkout",
    name: "情绪结算员",
    tagline: "你不是在买东西，你是在给情绪结账。",
    description:
      "购物和娱乐是你账单里最灵活、也最容易失控的一块。它的特征是：金额不大、频次不低、事后想不起为什么买。好消息是它最容易被规则管住——设一个数字上限，比靠自制力有效十倍。",
  },
  3: {
    key: "midnight-breaker",
    name: "深夜破防者",
    tagline: "白天很清醒，23 点后换了个人。",
    description:
      "夜间消费集中在少数几个时间窗，往往伴随外卖、打车、直播打赏或冲动下单。夜里决策的前额叶是关着的，付款却只要指纹。把「夜里能不能付钱」变成系统问题，而不是意志问题。",
  },
  4: {
    key: "subscription-host",
    name: "订阅寄生体",
    tagline: "每月被十几笔小额自动扣款养着。",
    description:
      "单笔都不贵，合计却是一笔硬支出，而且完全被动：你不再需要它，它还在扣。订阅的性质是「沉默的固定成本」，它不吵不闹，只是让每个月的起点更低一点。",
  },
  5: {
    key: "paycheck-passer",
    name: "月光巡航员",
    tagline: "工资到账即离场，账户只是中转站。",
    description:
      "收支几乎相抵，结余率偏低。这不是「花太多」的单一问题，而是缺少资金分配顺序：先花后存，永远存不下；先存后花，才叫预算。巡航员缺的从来不是收入，是顺序。",
  },
  6: {
    key: "month-cliff",
    name: "月中断崖客",
    tagline: "月中就见底，后半月靠意志与借款撑。",
    description:
      "按当前日均速率，你的预算会在月中前后烧穿。断崖的成因通常不是某笔大额，而是日常速率太高：每天多花 30 元，一个月就是 900 元的缺口。",
  },
};

const IRON: PersonaDef = {
  key: "iron-abacus",
  name: "铁算盘",
  tagline: "六爻皆稳，钱在你手里有秩序。",
  description:
    "必需占比、情绪消费、夜间支出、订阅、结余、燃尽六项全部在安全线内。真正的风险不是超支，而是「觉得自己没问题」之后的松懈：保持规则，别把余量当成可以花的钱。",
};

const SCATTER: PersonaDef = {
  key: "cyber-scatter",
  name: "赛博散财童子",
  tagline: "六爻阴了四爻以上——不是某一处漏，是到处都在漏。",
  description:
    "多处同时失守时，单点节流没用，必须换结构：先把固定支出（房租、订阅、通勤）压到收入的 50% 以内，再谈其他。散财不是性格问题，是缺少一张预算表。",
};

/** 每个爻位对应的「次漏点」补充说明，用于 2-3 处漏时的复合人格 */
const SECOND_LINE_HINT: Record<number, string> = {
  1: "底盘还在被挤",
  2: "情绪消费仍在放量",
  3: "深夜还在付款",
  4: "订阅还在自动续",
  5: "结余仍然贴地",
  6: "月中还在断崖",
};

export function buildPersona(ledger: Ledger, hexagram: Hexagram): Persona {
  if (hexagram.id === 0) {
    return {
      key: "no-ledger",
      name: "无账可看",
      tagline: "没有支出流水，就没有人格可读。",
      description: "这份账单只有收入或只有无法解析的行。先确认导出的是「交易明细」，再回来起卦。",
      traits: ["支出流水 0 笔", "无法计算结余率与燃尽日"],
      dominantLine: null,
    };
  }

  const leakLines = hexagram.lines.filter((l) => !l.yang).map((l) => l.index as number);

  if (leakLines.length === 0) {
    return {
      ...IRON,
      traits: [
        `六爻全阳，其中订阅 ${ledger.subscription.count} 个、每月 ${formatCents(ledger.subscription.cents)}`,
        `结余率 ${(ledger.savingRate * 100).toFixed(1)}%，本月净留下 ${formatCents(ledger.netCents)}`,
        `燃尽日：${hexagram.lines[5]!.display}`,
      ],
      dominantLine: null,
    };
  }

  if (leakLines.length >= 4) {
    return {
      ...SCATTER,
      traits: [
        `六爻中 ${leakLines.length} 爻为阴：${leakLines.map((i) => LINE_META[i - 1]!.leak).join("、")}`,
        `支出 ${formatCents(ledger.expenseCents)}，收入 ${formatCents(ledger.incomeCents)}`,
        `可选消费 ${formatCents(
          ledger.byCategory
            .filter((c) => c.key === "shopping" || c.key === "entertainment")
            .reduce((a, c) => a + c.cents, 0),
        )}，订阅 ${formatCents(ledger.subscription.cents)}`,
      ],
      dominantLine: null,
    };
  }

  // 1-3 处漏：以「最疼的那一爻」为主人格
  const dominant = pickDominant(ledger, hexagram.lines);
  const def = BY_LINE[dominant] ?? SCATTER;
  const secondary = leakLines.filter((i) => i !== dominant);
  const extra = secondary.map((i) => SECOND_LINE_HINT[i]).filter(Boolean);

  return {
    ...def,
    tagline: extra.length > 0 ? `${def.tagline}（同时：${extra.join("；")}）` : def.tagline,
    traits: [
      `${LINE_META[dominant - 1]!.position.split(" ")[0]}为阴，${LINE_META[dominant - 1]!.leak}`,
      `当月支出 ${formatCents(ledger.expenseCents)}，共 ${ledger.expenseTxnCount} 笔`,
      `结余率 ${(ledger.savingRate * 100).toFixed(1)}%，燃尽日 ${hexagram.lines[5]!.display}`,
    ],
    dominantLine: dominant,
  };
}

/**
 * 取「最疼」的阴爻：比较各爻对应的可回收金额。
 * 与 hexagram.dominantLeakIndex 同口径（那边用于卦象 advice），
 * 这里在无 runway 依赖时也能独立算出结果——但实际调用方统一由卦象传入 leak 列表，
 * 因此只做「金额最大」的近似排序：订阅与夜间金额可精确，其余用余额类近似。
 */
function pickDominant(ledger: Ledger, lines: Hexagram["lines"]): number {
  const emotional = ledger.byCategory
    .filter((c) => c.key === "shopping" || c.key === "entertainment")
    .reduce((a, c) => a + c.cents, 0);

  const pain: Record<number, number> = {
    1: Math.round(ledger.expenseCents * Math.max(0, 0.6 - ledger.essentialShare)),
    2: emotional,
    3: ledger.nightCents,
    4: ledger.subscription.cents,
    5: ledger.incomeCents > 0 ? Math.max(0, Math.round(ledger.incomeCents * 0.15) - ledger.netCents) : 0,
    6: 0,
  };

  let best = 0;
  let bestPain = -1;
  for (const line of lines) {
    if (line.yang) continue;
    const p = pain[line.index] ?? 0;
    // 上爻（燃尽）只在前五爻都没漏时兜底使用
    if (p > bestPain) {
      best = line.index;
      bestPain = p;
    }
  }
  return best || 2;
}
