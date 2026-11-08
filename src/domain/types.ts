/**
 * 赛博卦账 · 领域模型
 * ------------------------------------------------------------------
 * 约定（整个 domain 层唯一的真相来源）：
 * 1. 金额一律用「分」的整数传递（amountCents），避免 0.1 + 0.2 这类浮点误差；
 *    只在渲染层调用 formatCents() 转成「¥1,234.56」。
 * 2. 时间一律用 epoch 毫秒（ts），日期用本地时区的 YYYY-MM-DD 字符串。
 * 3. 领域层不依赖 React / Next / 浏览器 API，纯函数，可被 vitest 直接跑。
 */

/** 消费分类。essential=true 表示「生存必需」，用于算底盘占比 */
export type CategoryKey =
  | "food"
  | "transport"
  | "housing"
  | "daily"
  | "shopping"
  | "entertainment"
  | "learning"
  | "medical"
  | "social"
  | "subscription"
  | "transfer"
  | "income"
  | "other";

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  /** 生存必需：房租、吃饭、通勤、药品、日用品 */
  essential: boolean;
}

/** 一条已经清洗、可被引擎消费的流水 */
export interface Txn {
  id: string;
  ts: number;
  /** 本地时区 YYYY-MM-DD */
  date: string;
  /** 0-23 */
  hour: number;
  direction: "out" | "in";
  /** 正整数，单位：分 */
  amountCents: number;
  /** 账单里原始的对方/商品名，用于展示 */
  merchant: string;
  /** 商品说明/备注，展示时拼在商户后面（如「淘宝 · 蓝牙耳机」） */
  note?: string;
  /** 归一化后的商户键，用于聚合与订阅识别 */
  merchantKey: string;
  category: CategoryKey;
  /** 支付渠道（支付宝/微信/银行卡），可能为空 */
  channel?: string;
  /** 是否判定为订阅/自动续费 */
  isSubscription: boolean;
}

export type BillFormat = "alipay" | "wechat" | "bank" | "generic";

export interface ParseWarning {
  code: string;
  message: string;
  count: number;
}

export interface ParsedBill {
  txns: Txn[];
  totalRows: number;
  skippedRows: number;
  warnings: ParseWarning[];
  detected: {
    format: BillFormat;
    encoding: string;
    columns: {
      time?: string;
      amount?: string;
      direction?: string;
      merchant?: string;
      channel?: string;
    };
  };
}

export interface CategoryStat {
  key: CategoryKey;
  label: string;
  essential: boolean;
  cents: number;
  count: number;
  /** 0-1，占本月支出比例 */
  share: number;
}

export interface DayStat {
  /** 月内第几天，1 起 */
  day: number;
  date: string;
  /** 周几，0=周日 */
  weekday: number;
  expenseCents: number;
  incomeCents: number;
  count: number;
}

export interface SubscriptionItem {
  merchantKey: string;
  merchant: string;
  cents: number;
  count: number;
}

export interface Ledger {
  /** 账单归属月份，YYYY-MM */
  month: string;
  daysInMonth: number;
  /** 该月有流水的天数 */
  activeDays: number;
  txnCount: number;
  expenseTxnCount: number;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  /** 结余率 = net / income，income 为 0 时记 0 */
  savingRate: number;
  byCategory: CategoryStat[];
  byDay: DayStat[];
  /** 24 个桶，各小时支出（分） */
  byHour: number[];
  nightCents: number;
  /** 夜间（23:00-05:00）支出笔数 */
  nightCount: number;
  nightShare: number;
  weekendCents: number;
  essentialCents: number;
  essentialShare: number;
  subscription: {
    items: SubscriptionItem[];
    count: number;
    cents: number;
    share: number;
  };
  topExpenses: Txn[];
  medianExpenseCents: number;
  /** 单笔最大支出 */
  maxExpenseCents: number;
}

/** 一爻：账门 */
export interface HexLine {
  /** 1=初爻（最下） … 6=上爻（最上） */
  index: 1 | 2 | 3 | 4 | 5 | 6;
  /** true=阳（守住），false=阴（有漏） */
  yang: boolean;
  /** 爻位名称 */
  position: string;
  /** 这一爻在算什么 */
  metric: string;
  /** 展示用数值，例如 "62%" */
  display: string;
  /** 判定阈值说明 */
  rule: string;
  /** 爻辞（带真实数字） */
  text: string;
}

export interface Hexagram {
  /** 1-64，文王卦序 */
  id: number;
  name: string;
  /** 卦符，Unicode 4DC0 起按文王卦序排列 */
  symbol: string;
  upper: string;
  lower: string;
  /** 该卦的「账象辞」——本项目自撰，按六爻格局生成 */
  judgement: string;
  /** 行动指引，一句话 */
  advice: string;
  lines: HexLine[];
  /** 阴虚（有漏）的爻数 0-6 */
  leakCount: number;
}

export interface Persona {
  key: string;
  name: string;
  tagline: string;
  description: string;
  traits: string[];
  /** 主漏点所在爻位，无漏为 null */
  dominantLine: number | null;
}

export interface RunwayPoint {
  day: number;
  date: string;
  /** 实际累计支出（分），未来日为 null */
  actualCents: number | null;
  /** 预测累计支出（分），过去日为实际值 */
  projectedCents: number;
}

export interface Runway {
  budgetCents: number;
  /** 预算来源：income=按收入推算，custom=用户手填 */
  budgetSource: "income" | "custom" | "expense";
  elapsedDays: number;
  daysInMonth: number;
  dailyBurnCents: number;
  safeDailyCents: number;
  projectedTotalCents: number;
  /** 预计第几天烧穿预算；null 表示不会烧穿 */
  burnoutDay: number | null;
  /** 是否此刻已超支 */
  alreadyOver: boolean;
  points: RunwayPoint[];
}

export type Difficulty = 1 | 2 | 3;

export interface Prescription {
  id: string;
  title: string;
  oneLiner: string;
  steps: string[];
  /** 每月预计可省下的钱（分） */
  monthlySavingCents: number;
  difficulty: Difficulty;
  evidence: string;
  /** 关联的分类 */
  related?: CategoryKey;
}

export interface OracleResult {
  ledger: Ledger;
  hexagram: Hexagram;
  persona: Persona;
  runway: Runway;
  prescriptions: Prescription[];
  /** 一句话总断，给卡片标题用 */
  verdict: string;
}

export interface OracleOptions {
  /** 用户手填的本月可用金额（分）；不填则按收入推算 */
  budgetCentsOverride?: number;
}
