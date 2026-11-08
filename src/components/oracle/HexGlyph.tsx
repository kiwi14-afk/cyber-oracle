"use client";

/**
 * 卦符（自绘）
 * ------------------------------------------------------------------
 * 为什么不直接用 Unicode 的 ䷀…䷿：
 *   1. 六十四卦符号在多数系统字体里缺字或回退成方块，评委会看到「豆腐块」；
 *   2. 本项目承诺「不引在线字体、断网也能复现」，就不能赌字体覆盖；
 *   3. 自绘还能顺手把阴爻标成朱砂，和下面六爻面板的视觉语言完全对齐。
 * Unicode 卦符仍然保留在文案与复制结果里，用于纯文本场景。
 */

import type { HexLine } from "@/domain/types";

export function HexGlyph({ lines, height = 78 }: { lines: HexLine[]; height?: number }) {
  const rowHeight = height / 6;
  const barHeight = Math.max(3, Math.round(rowHeight * 0.34));
  const gap = (rowHeight - barHeight) / 2;

  return (
    <div
      className="shrink-0"
      style={{ width: height * 1.05, paddingTop: gap, paddingBottom: gap }}
      aria-label={`卦符 ${lines.map((l) => (l.yang ? "阳" : "阴")).join("")}`}
      role="img"
    >
      {[...lines].reverse().map((line, i) => (
        <div key={line.index} style={{ height: rowHeight, display: "flex", alignItems: "center", gap: "8%" }}>
          {line.yang ? (
            <div
              className="w-full"
              style={{
                height: barHeight,
                borderRadius: 2,
                background: "linear-gradient(90deg,#8a6320,#E4B457 40%,#f2d18d 50%,#E4B457 60%,#8a6320)",
                animation: `riseIn 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 70}ms both`,
              }}
            />
          ) : (
            <>
              {[0, 1].map((k) => (
                <div
                  key={k}
                  style={{
                    flex: 1,
                    height: barHeight,
                    borderRadius: 2,
                    background: "linear-gradient(180deg,rgba(226,69,60,0.9),rgba(198,49,40,0.65))",
                    animation: `riseIn 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 70}ms both`,
                  }}
                />
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
