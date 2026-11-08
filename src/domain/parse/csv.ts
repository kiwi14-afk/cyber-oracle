/**
 * 账单 CSV 解析器
 * ------------------------------------------------------------------
 * 目标：**不假设列名**。支付宝、微信、银行、自制模板四类账单的列名、
 * 分隔符、前置说明行都不同，这里做的是「探测式解析」：
 *   1. 前 12 行里找表头（哪一行命中的已知列名最多）；
 *   2. 按列名语义建索引，而不是按位置；
 *   3. 逐行容错：单行坏数据只计入 skippedRows，不中断整份账单；
 *   4. 多月份账单只保留流水最多的那个月，并给出告警。
 */

import Papa from "papaparse";
import { classify, looksLikeSubscription } from "../categories";
import type { BillFormat, ParseWarning, ParsedBill, Txn } from "../types";
import { decodeBillBuffer } from "./decode";
import { normalizeMerchant } from "./normalize";
import { hasNegativeSign, parseAmountToCents, parseTimestamp } from "./values";

export class BillParseError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BillParseError";
    this.code = code;
  }
}

type ColumnKey = "time" | "amount" | "direction" | "merchant" | "detail" | "channel" | "status";

const COLUMN_HINTS: Record<ColumnKey, RegExp[]> = {
  time: [/交易时间/, /交易日期/, /记账日期/, /发生时间/, /交易创建时间/, /^时间$/, /^日期$/, /^date$/i],
  amount: [/交易金额/, /金额/, /发生额/, /收支金额/, /^amount$/i, /^money$/i],
  // 只认「收/支」「收入/支出」「借贷标志」这类明确的方向列；
  // 「交易类型」在微信账单里是「商户消费/转账」，不是方向，抢占了会把手误判成支出
  direction: [/收\s*\/\s*支/, /收支/, /收入\s*\/\s*支出/, /借贷标志/, /^方向$/, /^direction$/i],
  merchant: [/交易对方/, /对方/, /商户名称/, /^商户$/, /收款方/, /^merchant$/i, /^payee$/i],
  // 商品说明是「这笔钱买了什么」，分类判定要用它；不能和「交易对方」混为一列
  detail: [/商品说明/, /^商品$/, /摘要/, /^描述$/i, /^description$/i, /备注/, /说明/, /^item$/i, /^note$/i],
  channel: [/收\s*\/\s*付款方式/, /支付方式/, /付款方式/, /^账户$/, /银行卡/, /^渠道$/],
  status: [/交易状态/, /状态/, /^status$/i],
};

const SKIP_STATUS = /(关闭|失败|未支付|已撤销|已取消)/;
const REFUND = /(退款|退货|冲正)/;
const SUMMARY_ROW = /^(合计|总计|汇总|小计|笔数|收支合计|总支出|总收入)/;

interface HeaderInfo {
  rowIndex: number;
  columns: Partial<Record<ColumnKey, number>>;
  names: Partial<Record<ColumnKey, string>>;
}

function matchColumn(cell: string): ColumnKey | null {
  const c = cell.trim();
  if (!c) return null;
  for (const key of Object.keys(COLUMN_HINTS) as ColumnKey[]) {
    if (COLUMN_HINTS[key].some((re) => re.test(c))) return key;
  }
  return null;
}

function detectHeader(rows: string[][]): HeaderInfo | null {
  let best: HeaderInfo | null = null;
  let bestScore = 0;
  const limit = Math.min(rows.length, 12);
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? [];
    const columns: Partial<Record<ColumnKey, number>> = {};
    const names: Partial<Record<ColumnKey, string>> = {};
    let score = 0;
    for (let j = 0; j < row.length; j++) {
      const cell = row[j] ?? "";
      const key = matchColumn(cell);
      if (key && columns[key] === undefined) {
        columns[key] = j;
        names[key] = cell.trim();
        // 时间与金额是硬指标，权重更高
        score += key === "time" || key === "amount" ? 3 : 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = { rowIndex: i, columns, names };
    }
  }
  if (!best) return null;
  if (best.columns.time === undefined || best.columns.amount === undefined) return null;
  return best;
}

function detectFormat(text: string): BillFormat {
  const head = text.slice(0, 2000);
  if (/支付宝/.test(head) || /交易对方/.test(head) && /收\/付款方式/.test(head)) return "alipay";
  if (/微信/.test(head) || /交易单号/.test(head)) return "wechat";
  if (/借贷标志|借方|贷方|记账日期|账户明细|银行/.test(head)) return "bank";
  return "generic";
}

function directionFromCell(value: string): "out" | "in" | null {
  const v = value.trim();
  if (!v || v === "/" || v === "-") return null;
  if (/(支出|付款|支|借|出账|消费)/.test(v)) return "out";
  if (/(收入|收款|收|贷|入账)/.test(v)) return "in";
  return null;
}

/**
 * 解析纯文本账单。
 * @param text 已解码的 CSV 文本
 * @param meta 编码等元信息，用于回填 detected
 */
export function parseBillText(
  text: string,
  meta: { encoding?: string; format?: BillFormat } = {},
): ParsedBill {
  if (!text.trim()) {
    throw new BillParseError("EMPTY_FILE", "文件是空的，没有可解析的内容。");
  }

  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const rows = parsed.data as string[][];
  if (rows.length === 0) {
    throw new BillParseError("EMPTY_FILE", "没有解析出任何一行数据。");
  }

  const header = detectHeader(rows);
  if (!header) {
    throw new BillParseError(
      "NO_COLUMN",
      "没有识别到账单表头。需要至少包含「交易时间」和「金额」两列（列名可以是 时间/日期、金额/交易金额）。",
    );
  }

  const warnings: ParseWarning[] = [];
  const txns: Txn[] = [];
  let skipped = 0;
  let totalRows = 0;

  const idx = header.columns;

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.length === 0) continue;
    totalRows++;

    const firstCell = (row[0] ?? "").trim();
    if (SUMMARY_ROW.test(firstCell)) {
      skipped++;
      continue;
    }

    const statusCell = idx.status !== undefined ? (row[idx.status] ?? "") : "";
    if (SKIP_STATUS.test(statusCell)) {
      skipped++;
      continue;
    }

    const timeCell = idx.time !== undefined ? row[idx.time] : undefined;
    const amountCell = idx.amount !== undefined ? row[idx.amount] : undefined;

    const time = parseTimestamp(timeCell);
    const cents = parseAmountToCents(amountCell);
    if (!time || cents === null) {
      skipped++;
      continue;
    }

    const merchantRaw = (idx.merchant !== undefined ? row[idx.merchant] : "") || "";
    const detailRaw = (idx.detail !== undefined ? row[idx.detail] : "") || "";
    const directionCell = idx.direction !== undefined ? (row[idx.direction] ?? "") : "";
    const typeCell = indexOrEmpty(row, idx.direction);
    const statusText = `${typeCell} ${statusCell} ${merchantRaw} ${detailRaw}`;

    let direction = directionFromCell(directionCell);
    if (!direction) direction = hasNegativeSign(amountCell) ? "out" : "out";
    if (REFUND.test(statusText)) direction = "in";

    const category = classify(direction, merchantRaw, detailRaw, typeCell);
    const isSubscription =
      direction === "out" && (looksLikeSubscription(merchantRaw, detailRaw) || category === "subscription");
    const channel = idx.channel !== undefined ? (row[idx.channel] ?? "").trim() : undefined;

    txns.push({
      id: `r${i}`,
      ts: time.ts,
      date: time.date,
      hour: time.hour,
      direction,
      amountCents: cents,
      merchant: merchantRaw || "未知商户",
      note: detailRaw || undefined,
      merchantKey: normalizeMerchant(merchantRaw || "未知商户"),
      category,
      channel: channel || undefined,
      isSubscription,
    });
  }

  if (txns.length === 0) {
    throw new BillParseError(
      "NO_VALID_ROW",
      "表头识别到了，但没有一行能解析出「时间 + 金额」。请检查金额是不是被拆在了收入/支出两列。",
    );
  }

  if (skipped > 0) {
    warnings.push({
      code: "SKIPPED_ROWS",
      message: `有 ${skipped} 行无法解析或属于汇总行，已跳过（不影响其余流水）。`,
      count: skipped,
    });
  }

  // 多月份：只留流水最多的月份
  const monthCount = new Map<string, number>();
  for (const t of txns) {
    const m = t.date.slice(0, 7);
    monthCount.set(m, (monthCount.get(m) ?? 0) + 1);
  }
  if (monthCount.size > 1) {
    const dominant = [...monthCount.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const filtered = txns.filter((t) => t.date.slice(0, 7) === dominant);
    const dropped = txns.length - filtered.length;
    warnings.push({
      code: "MULTI_MONTH",
      message: `账单里出现了 ${monthCount.size} 个月份，只分析流水最多的 ${dominant}（共 ${filtered.length} 笔），另 ${dropped} 笔未纳入。`,
      count: dropped,
    });
    txns.length = 0;
    txns.push(...filtered);
  }

  return {
    txns,
    totalRows,
    skippedRows: skipped,
    warnings,
    detected: {
      format: meta.format ?? detectFormat(text),
      encoding: meta.encoding ?? "utf-8",
      columns: header.names,
    },
  };
}

function indexOrEmpty(row: string[], idx: number | undefined): string {
  if (idx === undefined) return "";
  return (row[idx] ?? "").trim();
}

/** 从字节流解析（浏览器 / Node 通用） */
export function parseBillBuffer(buffer: ArrayBuffer | Uint8Array): ParsedBill {
  const decoded = decodeBillBuffer(buffer);
  return parseBillText(decoded.text, { encoding: decoded.encoding });
}
