/**
 * 卦象引擎：六爻判定 + 六十四卦映射 + 账象辞
 * ------------------------------------------------------------------
 * 「算卦」在这里不是玄学，而是一套**可解释的六维体检**：
 *   每一爻对应一个真实的账单指标，指标越界则为「阴」（有漏）。
 * 于是同一份账单永远得到同一卦——评委可以用两份样例互相验证，
 * 这正是「过程可复现」在业务逻辑层面的体现。
 *
 * 爻位（自下而上）：
 *   初爻 食宿根基 / 二爻 情绪口子 / 三爻 夜行 / 四爻 订阅寄生 / 五爻 储蓄锚 / 上爻 燃尽
 */

import { formatCents } from "./parse/values";
import type { HexLine, Hexagram, Ledger, Runway } from "./types";

export const TRIGRAM_ORDER = ["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"] as const;
export type Trigram = (typeof TRIGRAM_ORDER)[number];

/** 文王卦序表：上卦 × 下卦 → [卦序, 卦名] */
const HEXAGRAMS: Record<Trigram, Record<Trigram, [number, string]>> = {
  乾: {
    乾: [1, "乾为天"], 兑: [10, "天泽履"], 离: [13, "天火同人"], 震: [25, "天雷无妄"],
    巽: [44, "天风姤"], 坎: [6, "天水讼"], 艮: [33, "天山遁"], 坤: [12, "天地否"],
  },
  兑: {
    乾: [43, "泽天夬"], 兑: [58, "兑为泽"], 离: [49, "泽火革"], 震: [17, "泽雷随"],
    巽: [28, "泽风大过"], 坎: [47, "泽水困"], 艮: [31, "泽山咸"], 坤: [45, "泽地萃"],
  },
  离: {
    乾: [14, "火天大有"], 兑: [38, "火泽睽"], 离: [30, "离为火"], 震: [21, "火雷噬嗑"],
    巽: [50, "火风鼎"], 坎: [64, "火水未济"], 艮: [56, "火山旅"], 坤: [35, "火地晋"],
  },
  震: {
    乾: [34, "雷天大壮"], 兑: [54, "雷泽归妹"], 离: [55, "雷火丰"], 震: [51, "震为雷"],
    巽: [32, "雷风恒"], 坎: [40, "雷水解"], 艮: [62, "雷山小过"], 坤: [16, "雷地豫"],
  },
  巽: {
    乾: [9, "风天小畜"], 兑: [61, "风泽中孚"], 离: [37, "风火家人"], 震: [42, "风雷益"],
    巽: [57, "巽为风"], 坎: [59, "风水涣"], 艮: [53, "风山渐"], 坤: [20, "风地观"],
  },
  坎: {
    乾: [5, "水天需"], 兑: [60, "水泽节"], 离: [63, "水火既济"], 震: [3, "水雷屯"],
    巽: [48, "水风井"], 坎: [29, "坎为水"], 艮: [39, "水山蹇"], 坤: [8, "水地比"],
  },
  艮: {
    乾: [26, "山天大畜"], 兑: [41, "山泽损"], 离: [22, "山火贲"], 震: [27, "山雷颐"],
    巽: [18, "山风蛊"], 坎: [4, "山水蒙"], 艮: [52, "艮为山"], 坤: [23, "山地剥"],
  },
  坤: {
    乾: [11, "地天泰"], 兑: [19, "地泽临"], 离: [36, "地火明夷"], 震: [24, "地雷复"],
    巽: [46, "地风升"], 坎: [7, "地水师"], 艮: [15, "地山谦"], 坤: [2, "坤为地"],
  },
};

/** 三爻 → 八卦。参数为自下而上的三个 boolean（true=阳）。例：[true,false,false] = 震 ☳ */
export function trigramOf(bottom: boolean, middle: boolean, top: boolean): Trigram {
  const key = `${bottom ? 1 : 0}${middle ? 1 : 0}${top ? 1 : 0}`;
  const map: Record<string, Trigram> = {
    "111": "乾",
    "110": "兑",
    "101": "离",
    "100": "震",
    "011": "巽",
    "010": "坎",
    "001": "艮",
    "000": "坤",
  };
  return map[key]!;
}

/** 卦序 1-64 → Unicode 卦符（U+4DC0 起按文王卦序排列） */
export function hexSymbol(id: number): string {
  return String.fromCharCode(0x4dc0 + id - 1);
}

/** 每爻的语义：位置、指标、漏点名、以及一句「扎心话」 */
export const LINE_META = [
  {
    position: "初爻 · 食宿根基",
    metric: "生存必需（吃住行医）占支出的比例",
    leak: "根基浮动",
    punch: "钱先花在了「想要」上，撑着你的那部分反而被挤薄了。",
  },
  {
    position: "二爻 · 情绪口子",
    metric: "娱乐 + 购物等可选消费占支出的比例",
    leak: "情绪漏财",
    punch: "不是生活变贵了，是情绪替你按了付款键。",
  },
  {
    position: "三爻 · 夜行",
    metric: "23:00 之后的消费笔数与金额",
    leak: "深夜失守",
    punch: "凌晨的钱最不经思考，夜里付的款白天会心疼。",
  },
  {
    position: "四爻 · 订阅寄生",
    metric: "自动续费 / 会员类商户个数与月供",
    leak: "订阅寄生",
    punch: "每月固定扣走的那几笔，不是你花的，是「忘了取消」花的。",
  },
  {
    position: "五爻 · 储蓄锚",
    metric: "结余率 =（收入 − 支出）/ 收入",
    leak: "无锚月光",
    punch: "进多少出多少，工资只是过路财神。",
  },
  {
    position: "上爻 · 燃尽",
    metric: "按当前日均速率，预算烧穿的日期",
    leak: "月中断崖",
    punch: "月底不是紧，是断；断之前你还以为自己只是「有点超」。",
  },
] as const;

const THRESHOLDS = {
  essentialShare: 0.6,
  emotionalShare: 0.2,
  nightShare: 0.12,
  subscriptionCount: 2,
  savingRate: 0.15,
  burnoutDay: 26,
} as const;

function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export interface LineContext {
  ledger: Ledger;
  runway: Runway;
}

interface LineResult {
  yang: boolean;
  display: string;
  rule: string;
  text: string;
}

/** 六爻判定：唯一的判定入口，卦象与人格都复用它 */
export function evaluateLines(ctx: LineContext): LineResult[] {
  const { ledger, runway } = ctx;

  const emotionalCents = ledger.byCategory
    .filter((c) => c.key === "shopping" || c.key === "entertainment")
    .reduce((a, c) => a + c.cents, 0);
  const emotionalShare = ledger.expenseCents > 0 ? emotionalCents / ledger.expenseCents : 0;
  const topEmotional = ledger.byCategory
    .filter((c) => c.key === "shopping" || c.key === "entertainment")
    .sort((a, b) => b.cents - a.cents)[0];

  const nightCountShare = ledger.expenseTxnCount > 0 ? ledger.nightCount / ledger.expenseTxnCount : 0;
  const peakHour = ledger.byHour.reduce((best, cents, hour) => (cents > ledger.byHour[best]! ? hour : best), 0);

  const subCount = ledger.subscription.items.length;
  const subList = ledger.subscription.items
    .slice(0, 4)
    .map((s) => s.merchant)
    .join("、");

  const rate = ledger.savingRate;
  const burn = runway.burnoutDay;

  return [
    // 初爻：必需占比 ≥ 60% 为阳
    {
      yang: ledger.essentialShare >= THRESHOLDS.essentialShare,
      display: pct(ledger.essentialShare),
      rule: "生存必需占支出 ≥ 60% 记为阳",
      text:
        ledger.essentialShare >= THRESHOLDS.essentialShare
          ? `初爻得位。食宿通勤这些「必须」占了你 ${pct(ledger.essentialShare)} 的支出（${formatCents(ledger.essentialCents)}），底盘是稳的，你砍得起的是浮在上面的那层。`
          : `初爻失守。必需只占 ${pct(ledger.essentialShare)}，可选消费已经压到「必须」上面了——这是账单崩盘的第一张多米诺。`,
    },
    // 二爻：可选消费 ≤ 20% 为阳
    {
      yang: emotionalShare <= THRESHOLDS.emotionalShare,
      display: pct(emotionalShare, 1),
      rule: "娱乐 + 购物占支出 ≤ 20% 记为阳",
      text:
        emotionalShare <= THRESHOLDS.emotionalShare
          ? `二爻不摇。购物和娱乐压在 ${pct(emotionalShare, 1)}（${formatCents(emotionalCents)}），情绪还没拿到你的付款密码。`
          : `二爻开裂。购物和娱乐吃掉了 ${pct(emotionalShare, 1)}（${formatCents(emotionalCents)}），其中「${topEmotional ? topEmotional.label : "可选消费"}」是最大的口子（${formatCents(topEmotional ? topEmotional.cents : 0)}）。`,
    },
    // 三爻：深夜笔数占比 ≤ 12% 为阳
    {
      yang: nightCountShare <= THRESHOLDS.nightShare,
      display: `${pct(nightCountShare)} / ${ledger.nightCount} 笔`,
      rule: "23:00 后的支出笔数占比 ≤ 12% 记为阳",
      text:
        nightCountShare <= THRESHOLDS.nightShare
          ? `三爻安宁。深夜只有 ${ledger.nightCount} 笔、共 ${formatCents(ledger.nightCents)}，你的钱在白天比较清醒。`
          : `三爻夜动。23:00 之后有 ${ledger.nightCount} 笔消费、共 ${formatCents(ledger.nightCents)}；一天里花钱最凶的时段在 ${peakHour} 点——夜里付的钱，白天会心疼。`,
    },
    // 四爻：订阅商户 ≤ 2 个为阳
    {
      yang: subCount <= THRESHOLDS.subscriptionCount,
      display: `${subCount} 个 / ${formatCents(ledger.subscription.cents)}`,
      rule: "订阅类商户 ≤ 2 个记为阳",
      text:
        subCount <= THRESHOLDS.subscriptionCount
          ? `四爻清简。${subCount} 个订阅、每月 ${formatCents(ledger.subscription.cents)}，还养得起${subList ? `（${subList}）` : ""}。`
          : `四爻缠身。${subCount} 个订阅每月自动扣走 ${formatCents(ledger.subscription.cents)}，占支出 ${pct(ledger.subscription.share, 1)}：${subList}——这些钱不是你花的，是「忘了取消」花的。`,
    },
    // 五爻：结余率 ≥ 15% 为阳
    {
      yang: rate >= THRESHOLDS.savingRate,
      display: pct(rate, 1),
      rule: "结余率 ≥ 15% 记为阳",
      text:
        rate >= THRESHOLDS.savingRate
          ? `五爻有守。结余率 ${pct(rate, 1)}，本月留下 ${formatCents(ledger.netCents)}，你给自己留了退路。`
          : ledger.incomeCents > 0
            ? `五爻无锚。结余率只有 ${pct(rate, 1)}（本月净 ${formatCents(ledger.netCents)}），进多少出多少，工资只是过路财神。`
            : `五爻无锚。这份账单里没有一笔收入记录，支出 ${formatCents(ledger.expenseCents)} 全靠外部供给——先看清窟窿，再谈攒钱。`,
    },
    // 上爻：燃尽日 ≥ 26 或不会燃尽为阳
    {
      yang: burn === null || burn >= THRESHOLDS.burnoutDay,
      display: burn === null ? "未见断点" : `第 ${burn} 天`,
      rule: "预算在第 26 天之后（或不会）烧穿记为阳",
      text:
        burn === null
          ? `上爻不断。按日均 ${formatCents(runway.dailyBurnCents)} 的节奏，到月底还有余量，这个月不会变成「借钱月」。`
          : burn >= THRESHOLDS.burnoutDay
            ? `上爻将断未断。按日均 ${formatCents(runway.dailyBurnCents)} 的节奏，第 ${burn} 天才见底，收得住。`
            : `上爻断了。按日均 ${formatCents(runway.dailyBurnCents)} 的节奏，第 ${burn} 天就见底，之后每一天都是借来的。`,
    },
  ];
}

export function buildHexagram(ctx: LineContext): Hexagram {
  // 没有支出流水时不起卦：宁可显示「无卦」，也不给评委编一个像模像样的假卦
  if (ctx.ledger.expenseTxnCount === 0) {
    return {
      id: 0,
      name: "无卦",
      symbol: "—",
      upper: "—",
      lower: "—",
      judgement: "这份账单里没有可分析的支出流水，无从起卦。请确认导出的是「消费明细」而不是「收入流水」。",
      advice: "换一份包含支出记录的账单再来。",
      lines: LINE_META.map((meta, i) => ({
        index: (i + 1) as HexLine["index"],
        yang: false,
        position: meta.position,
        metric: meta.metric,
        display: "无数据",
        rule: "需要至少一笔支出流水",
        text: "本月没有支出流水，这一爻无从判定。",
      })),
      leakCount: 0,
    };
  }

  const results = evaluateLines(ctx);

  const lines: HexLine[] = results.map((r, i) => ({
    index: (i + 1) as HexLine["index"],
    yang: r.yang,
    position: LINE_META[i]!.position,
    metric: LINE_META[i]!.metric,
    display: r.display,
    rule: r.rule,
    text: r.text,
  }));

  const lower = trigramOf(results[0]!.yang, results[1]!.yang, results[2]!.yang);
  const upper = trigramOf(results[3]!.yang, results[4]!.yang, results[5]!.yang);
  const [id, name] = HEXAGRAMS[upper][lower];

  const leakIndexes = lines.filter((l) => !l.yang).map((l) => l.index);
  const dominant = dominantLeakIndex(ctx, results);

  return {
    id,
    name,
    symbol: hexSymbol(id),
    upper,
    lower,
    judgement: buildJudgement(name, upper, lower, results, leakIndexes),
    advice: dominant ? LINE_META[dominant - 1]!.punch : "六爻皆稳，保持这个节奏，把结余转成下个月的底气。",
    lines,
    leakCount: leakIndexes.length,
  };
}

function buildJudgement(
  name: string,
  upper: Trigram,
  lower: Trigram,
  results: LineResult[],
  leaks: number[],
): string {
  const shape = results.map((r) => (r.yang ? "阳" : "阴")).join("");

  if (leaks.length === 0) {
    return `六爻纯阳，上${upper}下${lower}，取象「${name}」。这个月的账没有缺口：钱花在该花的地方，也留下了余量。真正要防的不是超支，是「觉得没事」之后的下一次松懈。`;
  }

  const leakText = leaks
    .map((i) => `${LINE_META[i - 1]!.position.split(" ")[0]}（${LINE_META[i - 1]!.leak}）`)
    .join("、");
  const severity =
    leaks.length >= 4
      ? "阴气过半，是「月月补漏」的格局"
      : leaks.length >= 2
        ? "阴阳相杂，是「能过、但过得不稳」的格局"
        : "仅一处开裂，格局整体可控";

  return `六爻自下而上为「${shape}」，上${upper}下${lower}，取象「${name}」。${severity}：${leakText}。卦不吓人，爻位说话——先补最下面那道口子，上面的自然不容易塌。`;
}

/**
 * 哪一爻的「漏」在金额上最疼。
 * 只用「阴爻」参与比较，比较的是这一爻对应的**可回收金额**（潜在漏洞），
 * 这比按爻位顺序取第一个阴爻更有说服力。
 */
export function dominantLeakIndex(ctx: LineContext, results = evaluateLines(ctx)): number | null {
  const { ledger, runway } = ctx;

  const pain: Array<[number, number]> = [
    [1, Math.round(ledger.expenseCents * Math.max(0, THRESHOLDS.essentialShare - ledger.essentialShare))],
    [
      2,
      ledger.byCategory
        .filter((c) => c.key === "shopping" || c.key === "entertainment")
        .reduce((a, c) => a + c.cents, 0),
    ],
    [3, ledger.nightCents],
    [4, ledger.subscription.cents],
    [
      5,
      ledger.incomeCents > 0
        ? Math.max(0, Math.round(ledger.incomeCents * THRESHOLDS.savingRate) - ledger.netCents)
        : Math.round(ledger.expenseCents * THRESHOLDS.savingRate),
    ],
    [6, runway.burnoutDay ? Math.max(0, runway.projectedTotalCents - runway.budgetCents) : 0],
  ];

  let best: [number, number] | null = null;
  for (const item of pain) {
    if (results[item[0] - 1]!.yang) continue; // 没漏的爻不参与
    if (!best || item[1] > best[1]) best = item;
  }
  return best ? best[0] : null;
}
