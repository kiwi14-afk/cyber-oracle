"use client";

/**
 * 六爻可视化
 * ------------------------------------------------------------------
 * 传统卦象是「自下而上」画的，渲染时也一样：数组下标 0 = 初爻，显示在最下方。
 * 每一爻是一条可点击的「账门」：点开就能看到这一爻的指标、阈值与判词，
 * 让「玄学外观」和「可核对的规则」同时成立。
 */

import { useState } from "react";
import type { Hexagram } from "@/domain/types";
import { SectionHead } from "@/components/ui/atoms";

function Bar({ yang, index }: { yang: boolean; index: number }) {
  const delay = `${(5 - index) * 90}ms`;
  if (yang) {
    return (
      <div className="flex-1 overflow-hidden rounded-[3px] bg-ink-600">
        <div
          className="h-[10px] w-full rounded-[3px]"
          style={{
            background: "linear-gradient(90deg, #8a6320, #E4B457 35%, #f2d18d 50%, #E4B457 65%, #8a6320)",
            boxShadow: "0 0 18px -6px rgba(228,180,87,0.6)",
            animation: `riseIn 0.5s cubic-bezier(0.16,1,0.3,1) ${delay} both`,
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center gap-[13%]" style={{ animation: `riseIn 0.5s cubic-bezier(0.16,1,0.3,1) ${delay} both` }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-[10px] flex-1 rounded-[3px]"
          style={{
            background: "linear-gradient(180deg, rgba(226,69,60,0.85), rgba(198,49,40,0.6))",
            boxShadow: "0 0 16px -6px rgba(226,69,60,0.8)",
          }}
        />
      ))}
    </div>
  );
}

export function HexagramPanel({ hexagram }: { hexagram: Hexagram }) {
  const initial = hexagram.lines.find((l) => !l.yang)?.index ?? 6;
  const [selected, setSelected] = useState<number>(initial);

  const topDown = [...hexagram.lines].reverse();
  const current = hexagram.lines.find((l) => l.index === selected) ?? hexagram.lines[5]!;

  return (
    <div>
      <SectionHead index="01" title="六爻体检" hint="点开任意一爻看判定依据" />

      <div className="mb-3 flex items-center justify-between text-[11px] text-paper-600">
        <span>上爻在上 · 自下而上成卦</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded bg-brass-400" />阳 · 守住</span>
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded bg-cinnabar-500" />阴 · 有漏</span>
        </span>
      </div>

      <div className="space-y-2">
        {topDown.map((line) => {
          const active = selected === line.index;
          return (
            <button
              key={line.index}
              type="button"
              onClick={() => setSelected(line.index)}
              className={[
                "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-brass-400/40 bg-brass-400/[0.06]"
                  : "border-transparent hover:border-paper-100/12 hover:bg-paper-100/[0.03]",
              ].join(" ")}
            >
              <span className="w-[86px] shrink-0 text-[11px] text-paper-500 group-hover:text-paper-300">
                {line.position.split(" · ")[0]}
                <span className="ml-1 text-paper-600">{line.position.split(" · ")[1]}</span>
              </span>
              <div className="flex flex-1 items-center">
                <Bar yang={line.yang} index={line.index} />
              </div>
              <span className="num w-[86px] shrink-0 text-right text-xs text-paper-300">{line.display}</span>
              <span className={`w-6 shrink-0 text-center text-[11px] ${line.yang ? "text-brass-400" : "text-cinnabar-500"}`}>
                {line.yang ? "阳" : "阴"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-paper-100/10 bg-ink-800/60 p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="label">{current.position}</span>
          <span className={`text-[11px] ${current.yang ? "text-brass-400" : "text-cinnabar-500"}`}>
            {current.yang ? "阳爻 · 这一项守住了" : "阴爻 · 这一项在漏"}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-paper-100">{current.text}</p>
        <div className="mt-3 grid gap-1 text-[11px] text-paper-500">
          <span>指标：{current.metric}</span>
          <span>阈值：{current.rule}</span>
        </div>
      </div>
    </div>
  );
}
