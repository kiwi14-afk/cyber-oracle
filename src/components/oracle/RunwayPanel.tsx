"use client";

/**
 * 燃尽曲线
 * ------------------------------------------------------------------
 * 这张图是整个产品的「主证据」：实线是已经发生的累计支出，虚线是按日均速率外推，
 * 横向朱砂线是预算。两条线的交点就是「这个月的死期」。
 *
 * 工程细节：
 *   · echarts 用按需引入（core + line + grid + tooltip + markLine），首屏不背全量包；
 *   · 动态 import 放在 effect 里，服务端渲染阶段不碰 canvas；
 *   · 用 ResizeObserver 而不是 window.resize，避免侧栏折叠时图表不跟随。
 */

import { useEffect, useRef } from "react";
import type { Runway } from "@/domain/types";
import { SectionHead } from "@/components/ui/atoms";

interface ChartLike {
  setOption: (option: Record<string, unknown>) => void;
  resize: () => void;
  dispose: () => void;
}

function buildOption(runway: Runway): Record<string, unknown> {
  const days = runway.points.map((p) => p.day);
  const actual = runway.points.map((p) => (p.actualCents === null ? null : p.actualCents / 100));
  const projected = runway.points.map((p, i) => (i < runway.elapsedDays - 1 ? null : p.projectedCents / 100));

  const axisLabelColor = "#9C9486";
  const splitColor = "rgba(243,238,227,0.08)";
  // 纵轴必须把预算线包进视野，否则「死期」这条最重要的线会被自动缩放裁掉
  const axisMax = Math.max(runway.budgetCents, runway.projectedTotalCents, ...runway.points.map((p) => p.projectedCents)) / 100 * 1.08;

  return {
    backgroundColor: "transparent",
    animationDuration: 900,
    animationEasing: "cubicOut",
    grid: { left: 6, right: 18, top: 22, bottom: 26, containLabel: true },
    legend: {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: axisLabelColor, fontSize: 11 },
      data: [
        { name: "实际累计", icon: "roundRect" },
        { name: "按日均外推", icon: "rect" },
      ],
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(12,14,19,0.94)",
      borderColor: "rgba(243,238,227,0.16)",
      borderWidth: 1,
      textStyle: { color: "#F3EEE3", fontSize: 12 },
      axisPointer: { type: "line", lineStyle: { color: "rgba(228,180,87,0.5)" } },
      formatter: (params: Array<{ axisValue: string; seriesName: string; value: number | null }>) => {
        const day = params[0]?.axisValue ?? "";
        const rows = params
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => `${p.seriesName}　¥${Number(p.value).toFixed(2)}`)
          .join("<br/>");
        return `第 ${day} 天<br/>${rows}`;
      },
    },
    xAxis: {
      type: "category",
      data: days,
      boundaryGap: false,
      axisLine: { lineStyle: { color: splitColor } },
      axisTick: { show: false },
      axisLabel: {
        color: axisLabelColor,
        fontSize: 10,
        interval: (index: number) => index === 0 || (index + 1) % 5 === 0,
        formatter: (value: string) => `${value}日`,
      },
    },
    yAxis: {
      type: "value",
      name: "元",
      max: Number.isFinite(axisMax) ? Math.ceil(axisMax / 500) * 500 : undefined,
      nameTextStyle: { color: axisLabelColor, fontSize: 10, padding: [0, 0, 0, -18] },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: splitColor } },
      axisLabel: {
        color: axisLabelColor,
        fontSize: 10,
        formatter: (value: number) => (value >= 10000 ? `${(value / 10000).toFixed(1)}万` : `${Math.round(value)}`),
      },
    },
    series: [
      {
        name: "实际累计",
        type: "line",
        data: actual,
        smooth: 0.3,
        symbol: "circle",
        symbolSize: 4,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 2, color: "#E4B457", shadowColor: "rgba(228,180,87,0.35)", shadowBlur: 14 },
        itemStyle: { color: "#E4B457" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(228,180,87,0.22)" },
              { offset: 1, color: "rgba(228,180,87,0.02)" },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: "none",
          label: {
            show: true,
            position: "insideEndTop",
            color: "#E2453C",
            fontSize: 10,
            formatter: `预算 ¥${(runway.budgetCents / 100).toFixed(0)}`,
          },
          lineStyle: { color: "rgba(226,69,60,0.75)", type: "dashed", width: 1 },
          data: [{ yAxis: runway.budgetCents / 100 }],
        },
      },
      {
        name: "按日均外推",
        type: "line",
        data: projected,
        smooth: 0.15,
        symbol: "none",
        lineStyle: { width: 1.5, color: "#38D9A9", type: "dashed", opacity: 0.85 },
        itemStyle: { color: "#38D9A9" },
      },
    ],
  };
}

export function RunwayPanel({ runway }: { runway: Runway }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: ChartLike | null = null;
    let disposed = false;
    let observer: ResizeObserver | null = null;

    (async () => {
      const core = await import("echarts/core");
      const { LineChart } = await import("echarts/charts");
      const { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent } = await import("echarts/components");
      const { CanvasRenderer } = await import("echarts/renderers");

      core.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, CanvasRenderer]);
      if (disposed || !ref.current) return;

      chart = core.init(ref.current, undefined, { renderer: "canvas" }) as unknown as ChartLike;
      chart.setOption(buildOption(runway));
      (window as unknown as { __runwayChart?: unknown }).__runwayChart = chart;

      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(ref.current);
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [runway]);

  const remaining = runway.daysInMonth - runway.elapsedDays;
  const budgetLeft = runway.budgetCents - runway.projectedTotalCents;

  return (
    <div>
      <SectionHead
        index="02"
        title="现金流燃尽曲线"
        hint={`预算 ${runway.budgetSource === "custom" ? "手填" : runway.budgetSource === "income" ? "按收入" : "按支出"} · 已过 ${runway.elapsedDays} 天`}
      />

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-paper-100/10 bg-ink-800/50 px-3 py-2">
          <div className="text-[10px] text-paper-600">日均燃烧</div>
          <div className="num mt-0.5 text-sm text-paper-100">¥{(runway.dailyBurnCents / 100).toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-paper-100/10 bg-ink-800/50 px-3 py-2">
          <div className="text-[10px] text-paper-600">安全日耗</div>
          <div className="num mt-0.5 text-sm text-paper-100">¥{(runway.safeDailyCents / 100).toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-paper-100/10 bg-ink-800/50 px-3 py-2">
          <div className="text-[10px] text-paper-600">剩余 {remaining} 天</div>
          <div className={`num mt-0.5 text-sm ${budgetLeft < 0 ? "text-cinnabar-500" : "text-jade-400"}`}>
            {budgetLeft < 0 ? `缺 ¥${(Math.abs(budgetLeft) / 100).toFixed(0)}` : `余 ¥${(budgetLeft / 100).toFixed(0)}`}
          </div>
        </div>
      </div>

      <div ref={ref} className="h-[240px] w-full" />

      <p className="mt-2 text-[11px] leading-relaxed text-paper-500">
        {runway.burnoutDay
          ? `实线走到第 ${runway.burnoutDay} 天时越过朱砂预算线——这就是「死期」。` +
            (runway.alreadyOver ? "（已实际发生）" : "（按日均外推）")
          : "外推曲线始终在预算线下方，本月不会见底；真正的风险是「觉得没事」之后的松懈。"}
      </p>
    </div>
  );
}
