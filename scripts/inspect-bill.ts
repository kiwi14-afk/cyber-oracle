/**
 * 本地体检 CLI
 * ------------------------------------------------------------------
 * 用途：不启动浏览器、不配置 API Key，直接在终端看一份账单会算出什么卦。
 * 这也是「确定性」的证据：同一份 CSV，任何人跑同一条命令，输出必须完全一致。
 *
 *   npm run inspect -- samples/bill-student.csv
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOracle } from "../src/domain/oracle";
import { parseBillBuffer } from "../src/domain/parse/csv";
import { formatCents } from "../src/domain/parse/values";

const file = process.argv[2];
if (!file) {
  console.error("用法: npm run inspect -- <账单.csv>");
  process.exit(1);
}

const path = resolve(process.cwd(), file);
const parsed = parseBillBuffer(readFileSync(path));
const oracle = buildOracle(parsed);
const { ledger, hexagram, persona, runway, prescriptions } = oracle;

const line = (label: string, value: string) => `${label.padEnd(10, " ")} ${value}`;

console.log("");
console.log(`账单文件  ${file}`);
console.log(`解析结果  ${ledger.month} · ${parsed.txns.length} 笔 · 编码 ${parsed.detected.encoding} · 格式 ${parsed.detected.format}`);
console.log(`收支      收入 ${formatCents(ledger.incomeCents)} / 支出 ${formatCents(ledger.expenseCents)} / 净 ${formatCents(ledger.netCents)}（结余率 ${(ledger.savingRate * 100).toFixed(1)}%）`);
console.log("");
console.log(`卦象      ${hexagram.symbol} 第 ${hexagram.id} 卦 · ${hexagram.name}（上${hexagram.upper}下${hexagram.lower}）`);
console.log(`总断      ${oracle.verdict}`);
console.log(`人格      ${persona.name} — ${persona.tagline}`);
console.log("");
console.log(line("爻位", "判定"));
for (const l of hexagram.lines) {
  console.log(line(l.position, `${l.yang ? "阳" : "阴"}  ${l.display}`));
}
console.log("");
console.log(`卦辞      ${hexagram.judgement}`);
console.log("");
console.log(`燃尽      预算 ${formatCents(runway.budgetCents)}（${runway.budgetSource}） · 日均 ${formatCents(runway.dailyBurnCents)} · ${runway.burnoutDay ? `第 ${runway.burnoutDay} 天见底` : "不会见底"}`);

if (process.argv.includes("--verbose")) {
  console.log("");
  console.log("分类明细");
  for (const c of ledger.byCategory) {
    console.log(`  ${c.label.padEnd(6, "　")} ${formatCents(c.cents).padStart(12, " ")}  ${(c.share * 100).toFixed(1)}%  ${c.count} 笔${c.essential ? "  [必需]" : ""}`);
  }
  console.log(`  ${"订阅".padEnd(6, "　")} ${formatCents(ledger.subscription.cents).padStart(12, " ")}  ${ledger.subscription.count} 个：${ledger.subscription.items.map((s) => s.merchant).join("、")}`);
}
console.log("");
console.log("处方");
for (const [i, p] of prescriptions.entries()) {
  console.log(`  ${i + 1}. ${p.title}（每月约省 ${formatCents(p.monthlySavingCents)}）`);
  console.log(`     ${p.oneLiner}`);
  console.log(`     证据：${p.evidence}`);
}
if (parsed.warnings.length > 0) {
  console.log("");
  console.log("告警");
  for (const w of parsed.warnings) console.log(`  · ${w.message}`);
}
console.log("");
