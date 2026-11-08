"use client";

/**
 * 主流程编排
 * ------------------------------------------------------------------
 * 三个阶段：投放（landing）→ 解析（parsing）→ 卦盘（board）。
 *
 * 关键工程选择：**解析与起卦都在浏览器里跑**。
 * parseBillBuffer / buildOracle 是领域层的纯函数，没有任何 Node 依赖，
 * 因此前端可以直接调用——原始流水一行都不出设备，隐私承诺才成立。
 * `/api/*` 只接收聚合后的小信封，用于模型讲解。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OracleResult, ParsedBill } from "@/domain/types";
import { buildOracle } from "@/domain/oracle";
import { parseBillBuffer, BillParseError } from "@/domain/parse/csv";
import { formatCents } from "@/domain/parse/values";
import { toPayload } from "@/lib/ai/payload";
import { BillDropzone, type SampleOption } from "./BillDropzone";
import { HexGlyph } from "./HexGlyph";
import { HexagramPanel } from "./HexagramPanel";
import { RunwayPanel } from "./RunwayPanel";
import { CategoryPanel } from "./CategoryPanel";
import { PersonaCard, PrescriptionCards } from "./PrescriptionCards";
import { NarrativePanel } from "./NarrativePanel";
import { ChatPanel } from "./ChatPanel";
import { Chip, Metric, Panel } from "@/components/ui/atoms";

type Stage = "landing" | "parsing" | "board";

const PARSE_STEPS = ["读取文件", "识别编码", "匹配表头", "清洗流水", "起卦"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errorMessage(err: unknown): string {
  if (err instanceof BillParseError) {
    switch (err.code) {
      case "EMPTY_FILE":
        return "这个文件是空的，或者全是说明文字，没有可解析的表格。请重新从支付宝/微信导出「交易明细」。";
      case "NO_COLUMN":
        return "没找到时间与金额这两列。请确认导出的是 CSV 明细，而不是 PDF 或截图转换来的文本。";
      case "NO_VALID_ROW":
        return "表头找到了，但每一行都不合格（金额或时间解析失败）。可以先用样例对比一下格式差异。";
      default:
        return err.message;
    }
  }
  return (err as Error)?.message ?? "解析失败，换一份文件试试。";
}

export function OracleApp() {
  const [stage, setStage] = useState<Stage>("landing");
  const [parsed, setParsed] = useState<ParsedBill | null>(null);
  const [result, setResult] = useState<OracleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [aiMode, setAiMode] = useState<"ai" | "local">("local");
  const [fileName, setFileName] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const budgetCents = useMemo(() => {
    const value = Number(budgetInput.replace(/[,，\s]/g, ""));
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return Math.round(value * 100);
  }, [budgetInput]);

  useEffect(() => {
    if (!parsed) return;
    setResult(buildOracle(parsed, { budgetCentsOverride: budgetCents }));
  }, [parsed, budgetCents]);

  const runPipeline = useCallback(async (buffer: ArrayBuffer, name: string) => {
    setStage("parsing");
    setError(null);
    setStepIndex(0);
    setFileName(name);

    try {
      // 每一步之间让出主线程，让进度条真实反映「正在做什么」，而不是假动画
      await sleep(160);
      setStepIndex(1);
      const bytes = new Uint8Array(buffer);
      await sleep(160);
      setStepIndex(2);
      const bill = parseBillBuffer(bytes);
      await sleep(160);
      setStepIndex(3);
      await sleep(140);
      setStepIndex(4);

      const oracle = buildOracle(bill);
      await sleep(220);
      setParsed(bill);
      setResult(oracle);
      setStage("board");
    } catch (err) {
      setError(errorMessage(err));
      setStage("landing");
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > 20 * 1024 * 1024) {
        setError("文件超过 20MB。账单 CSV 一般只有几百 KB，请确认没有把整年的流水合并导出。");
        return;
      }
      try {
        await runPipeline(await file.arrayBuffer(), file.name);
      } catch (err) {
        setError(errorMessage(err));
        setStage("landing");
      }
    },
    [runPipeline],
  );

  const handleSample = useCallback(
    async (sample: SampleOption) => {
      try {
        const res = await fetch(sample.file);
        if (!res.ok) throw new Error(`样例下载失败（HTTP ${res.status}）`);
        await runPipeline(await res.arrayBuffer(), sample.file.split("/").pop() ?? sample.name);
      } catch (err) {
        setError(errorMessage(err));
        setStage("landing");
      }
    },
    [runPipeline],
  );

  const reset = useCallback(() => {
    setStage("landing");
    setParsed(null);
    setResult(null);
    setBudgetInput("");
    setFileName("");
  }, []);

  const copySummary = useCallback(async () => {
    if (!result) return;
    const lines = [
      `【${result.hexagram.symbol} ${result.hexagram.name} · ${result.persona.name}】`,
      result.verdict,
      "",
      ...result.prescriptions.map((p, i) => `${i + 1}. ${p.title}（省 ${formatCents(p.monthlySavingCents)}/月）\n   ${p.steps[0]}`),
      "",
      "由「赛博卦账」生成 · 数据本地计算，未上传",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [result]);

  const payload = useMemo(() => (result ? toPayload(result) : null), [result]);

  if (stage === "landing" || stage === "parsing") {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 pt-10 pb-16">
        <div className="mb-9 flex items-start justify-between gap-4">
          <div>
            <div className="label mb-3 flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brass-400" />
              赛博卦账 · cyber oracle
            </div>
            <h1 className="max-w-2xl font-serif text-[34px] leading-[1.25] text-paper-100 sm:text-[42px]">
              把一个月账单
              <span className="text-gradient-brass">算成一卦</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-paper-500">
              六个爻位对应六项真实的财务指标：必需占比、情绪消费、夜行、订阅、结余、燃尽。
              卦不是随机落出来的，是算出来的——同一份账单永远得到同一卦。
            </p>
          </div>
          <div className="hidden shrink-0 text-right sm:block">
            <div className="font-serif text-[13px] tracking-[0.3em] text-paper-600">䷀ ䷁ ䷂ ䷃</div>
            <div className="mt-2 text-[10px] text-paper-600">六十四卦 · 全部可复算</div>
          </div>
        </div>

        {stage === "parsing" ? (
          <Panel className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-paper-300">正在解析 {fileName}</div>
              <div className="num text-xs text-paper-500">{stepIndex + 1}/{PARSE_STEPS.length}</div>
            </div>
            <div className="grid gap-2">
              {PARSE_STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  <span
                    className={[
                      "flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                      i < stepIndex
                        ? "border-jade-500/40 bg-jade-400/10 text-jade-400"
                        : i === stepIndex
                          ? "border-brass-400/50 bg-brass-400/10 text-brass-400"
                          : "border-paper-100/12 text-paper-600",
                    ].join(" ")}
                  >
                    {i < stepIndex ? "✓" : i + 1}
                  </span>
                  <span className={i <= stepIndex ? "text-[13px] text-paper-200" : "text-[13px] text-paper-600"}>{s}</span>
                  {i === stepIndex ? <span className="ml-1 h-3 w-3 animate-pulse rounded-full bg-brass-400/40" /> : null}
                </div>
              ))}
            </div>
            <div className="mt-5 h-[3px] w-full overflow-hidden rounded-full bg-paper-100/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brass-500 to-brass-400 transition-all duration-300"
                style={{ width: `${((stepIndex + 1) / PARSE_STEPS.length) * 100}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] text-paper-600">全部步骤在浏览器本地完成，文件不会离开这台电脑。</p>
          </Panel>
        ) : (
          <Panel className="p-5 sm:p-6">
            <BillDropzone onFile={(f) => void handleFile(f)} onSample={(s) => void handleSample(s)} error={error} />
          </Panel>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { t: "六爻体检", d: "六项指标各自设阈值，阴爻即漏点，点开能看到判定依据。" },
            { t: "燃尽日", d: "用有消费日的中位数速率外推，给出确定的「第几天见底」。" },
            { t: "三剂处方", d: "每条都带可执行的三步与真实商户证据，并算清每月省多少。" },
          ].map((f) => (
            <div key={f.t} className="rounded-lg border border-paper-100/10 bg-ink-800/35 px-4 py-3.5">
              <div className="font-serif text-[15px] text-paper-100">{f.t}</div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-paper-500">{f.d}</div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-paper-600">
          隐私说明：账单在浏览器内存中解析，不写入数据库、不上传服务器；送给模型的是聚合后的卦案（金额、占比、卦象），
          不含商户明细与原始流水。仓库内置的样例均为虚构脱敏数据。
        </p>
      </div>
    );
  }

  if (!result || !payload) return null;

  const { ledger, hexagram, persona, runway, prescriptions } = result;
  const budgetLabel = runway.budgetSource === "custom" ? "手填额度" : runway.budgetSource === "income" ? "按收入" : "按支出反推";

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-8 pb-16">
      {/* 顶栏 */}
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-paper-100/10 pb-4">
        <div className="flex items-center gap-3">
          <span className="font-serif text-sm text-paper-300">赛博卦账</span>
          <span className="h-px w-6 bg-paper-100/15" />
          <span className="num text-xs text-paper-500">{ledger.month} · {fileName}</span>
          {parsed?.warnings.length ? <Chip tone="neutral">{parsed.warnings[0]!.message}</Chip> : null}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <button type="button" onClick={copySummary} className="text-paper-500 transition-colors hover:text-paper-100">
            {copied ? "已复制结论" : "复制结论"}
          </button>
          <button type="button" onClick={reset} className="btn btn-ghost px-3 py-1.5">换一份账单</button>
        </div>
      </div>

      {/* 卦象主视觉 */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex items-start gap-5">
          <HexGlyph lines={hexagram.lines} />
          <div className="min-w-0">
            <div className="label mb-1">
              第 {hexagram.id} 卦 · {hexagram.upper}上{hexagram.lower}下
            </div>
            <h2 className="font-serif text-[30px] leading-tight text-paper-100">{hexagram.name}</h2>
            <p className="mt-2 max-w-lg text-[13px] leading-relaxed text-paper-500">{hexagram.judgement}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip tone={hexagram.leakCount === 0 ? "jade" : hexagram.leakCount >= 4 ? "cinnabar" : "brass"}>
                {hexagram.leakCount} 处漏点
              </Chip>
              <Chip tone="neutral">{persona.name}</Chip>
              <Chip tone={runway.burnoutDay ? "cinnabar" : "jade"}>
                {runway.burnoutDay ? `第 ${runway.burnoutDay} 天见底` : "全月有量"}
              </Chip>
            </div>
          </div>
        </div>

        <Panel flat className="p-4">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="本月支出" value={formatCents(ledger.expenseCents)} sub={`${ledger.expenseTxnCount} 笔`} />
            <Metric
              label="结余率"
              value={`${(ledger.savingRate * 100).toFixed(1)}%`}
              sub={formatCents(ledger.netCents, { sign: true })}
              tone={ledger.savingRate < 0 ? "danger" : "good"}
            />
            <Metric
              label="订阅月供"
              value={formatCents(ledger.subscription.cents)}
              sub={`${ledger.subscription.count} 项自动续费`}
              tone={ledger.subscription.count > 2 ? "danger" : "default"}
            />
          </div>

          <div className="mt-4 border-t border-paper-100/10 pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label">本月可用金额</span>
              <span className="text-[10px] text-paper-600">{budgetLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-paper-500">¥</span>
                <input
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  inputMode="decimal"
                  placeholder={(runway.budgetSource === "income" ? ledger.incomeCents / 100 : runway.budgetCents / 100).toFixed(0)}
                  className="num w-full rounded-lg border border-paper-100/12 bg-ink-900/60 py-2 pl-7 pr-3 text-[13px] text-paper-100 outline-none transition-colors placeholder:text-paper-600 focus:border-brass-400/40"
                />
              </div>
              <span className="num shrink-0 text-xs text-paper-500">预算 {formatCents(runway.budgetCents)}</span>
            </div>
            <p className="mt-1.5 text-[10px] text-paper-600">改这个数字，燃尽日会立刻重算——这是「可复算」的现场证明。</p>
          </div>
        </Panel>
      </div>

      {/* 六爻 + 燃尽 */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel className="p-5"><HexagramPanel hexagram={hexagram} /></Panel>
        <Panel className="p-5"><RunwayPanel runway={runway} /></Panel>
      </div>

      {/* 分类 + 人格 + 卦辞 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1.15fr]">
        <Panel className="p-5"><CategoryPanel ledger={ledger} /></Panel>
        <Panel className="p-5"><PersonaCard persona={persona} verdict={result.verdict} /></Panel>
        <Panel className="p-5"><NarrativePanel payload={payload} onModeChange={setAiMode} /></Panel>
      </div>

      {/* 处方 */}
      <div className="mt-6">
        <Panel className="p-5"><PrescriptionCards prescriptions={prescriptions} /></Panel>
      </div>

      {/* 追问 */}
      <div className="mt-4">
        <Panel className="p-5"><ChatPanel payload={payload} aiEnabled={aiMode === "ai"} /></Panel>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2 text-[10px] text-paper-600">
        <span>数据本地计算 · 上行只有聚合卦案 · 样例均为虚构脱敏账单</span>
        <span>
          判定阈值见 <span className="text-paper-500">src/domain/hexagram.ts</span>，可用{" "}
          <span className="text-paper-500">npm run inspect</span> 在终端复算
        </span>
      </div>
    </div>
  );
}
