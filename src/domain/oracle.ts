/**
 * 编排层：把「解析结果」一路推到「可直接渲染的卦案」
 * ------------------------------------------------------------------
 * 依赖方向严格单向：
 *   parse → ledger → runway → hexagram(+persona) → prescriptions → oracle
 * 每一层只依赖上一层的数据结构，不回头读原始流水。
 * 这样任何一层都能单独单测，也方便以后换渲染端（小程序/CLI）时复用。
 */

import { buildHexagram } from "./hexagram";
import { buildLedger } from "./ledger";
import { buildPersona } from "./persona";
import { buildPrescriptions } from "./prescription";
import { formatCents } from "./parse/values";
import { buildRunway } from "./runway";
import type { OracleOptions, OracleResult, ParsedBill } from "./types";

export function buildOracle(parsed: ParsedBill, options: OracleOptions = {}): OracleResult {
  const ledger = buildLedger(parsed.txns);
  const runway = buildRunway(ledger, options);
  const ctx = { ledger, runway };

  const hexagram = buildHexagram(ctx);
  const persona = buildPersona(ledger, hexagram);
  const prescriptions = buildPrescriptions({ ledger, runway, hexagram });

  const totalSaving = prescriptions.reduce((a, p) => a + p.monthlySavingCents, 0);

  const burnoutText = runway.burnoutDay
    ? `第 ${runway.burnoutDay} 天见底`
    : `全月有量（预计结余 ${formatCents(runway.budgetCents - runway.projectedTotalCents)}）`;

  const verdict =
    hexagram.id === 0
      ? "无卦：这份账单没有可分析的支出流水"
      : `${persona.name} · ${burnoutText} · 三剂处方可省 ${formatCents(totalSaving)}/月`;

  return { ledger, hexagram, persona, runway, prescriptions, verdict };
}

export * from "./types";
export { buildLedger, dominantMonth, daysInMonthOf } from "./ledger";
export { buildRunway } from "./runway";
export { buildHexagram, evaluateLines, hexSymbol, LINE_META, trigramOf } from "./hexagram";
export { buildPersona } from "./persona";
export { buildPrescriptions, DIFFICULTY_LABEL } from "./prescription";
export { parseBillBuffer, parseBillText, BillParseError } from "./parse/csv";
export { decodeBillBuffer } from "./parse/decode";
export { normalizeMerchant, displayMerchant } from "./parse/normalize";
export { parseAmountToCents, parseTimestamp, formatCents } from "./parse/values";
export { CATEGORIES, classify } from "./categories";
