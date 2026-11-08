"use client";

/**
 * 账单投放区
 * ------------------------------------------------------------------
 * 交互要点：
 *   · 拖拽与点击都可上传，拖拽时整块高亮（不用 hover 阴影，避免和 panel 冲突）；
 *   · 明确告诉用户「抠不出来的格式」：只支持 CSV，并给三份样例一键体验；
 *   · 隐私承诺写在按钮下面，而不是藏在页脚——这是这个产品最要紧的说服点。
 */

import { useCallback, useRef, useState } from "react";

export interface SampleOption {
  key: string;
  name: string;
  file: string;
  desc: string;
}

export const SAMPLES: SampleOption[] = [
  { key: "student", name: "学生 · 生活费型", file: "/samples/bill-student.csv", desc: "收入 2,300 / 支出 1,368，夜宵与订阅各有一笔" },
  { key: "moonlight", name: "月光 · 工资型", file: "/samples/bill-moonlight.csv", desc: "收入 6,200 / 支出 6,647，月末见底" },
  { key: "steady", name: "稳健 · 结余型", file: "/samples/bill-steady.csv", desc: "收入 9,500 / 支出 6,403，六爻皆稳" },
  { key: "wechat", name: "微信导出 · GBK", file: "/samples/bill-wechat-gbk.csv", desc: "编码是 GB18030，用来验证自动转码" },
];

export function BillDropzone({
  onFile,
  onSample,
  disabled,
  error,
}: {
  onFile: (file: File) => void;
  onSample: (sample: SampleOption) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        aria-label="上传账单 CSV"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) pick(e.dataTransfer.files);
        }}
        className={[
          "group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-xl2 border px-6 py-10 text-center transition-all",
          dragging
            ? "border-brass-400/70 bg-brass-400/[0.07]"
            : "border-paper-100/12 bg-ink-800/50 hover:border-paper-100/25 hover:bg-ink-700/60",
          disabled ? "pointer-events-none opacity-50" : "",
        ].join(" ")}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-paper-100/12 bg-ink-700/60">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 16V4m0 0-4 4m4-4 4 4" stroke="#E4B457" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13A1.5 1.5 0 0 0 20 18.5V15" stroke="#9C9486" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
        <p className="font-serif text-lg text-paper-100">把账单拖进来，或者点这里选择文件</p>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-paper-500">
          支持支付宝 / 微信 / 银行导出的 CSV（.csv / .txt）。UTF-8 与 GBK 都能自动识别，
          不需要先改列名。
        </p>
        <p className="mt-3 text-[11px] tracking-wide text-paper-600">
          解析与起卦全部在浏览器本地完成 · 文件不会上传到任何服务器
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv"
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-cinnabar-500/35 bg-cinnabar-500/[0.08] px-4 py-3 text-sm text-cinnabar-500">
          {error}
        </div>
      ) : null}

      <div className="mt-5">
        <div className="label mb-3">没有账单？用样例直接看效果</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={disabled}
              onClick={() => onSample(s)}
              className="group flex items-start justify-between gap-3 rounded-lg border border-paper-100/10 bg-ink-800/40 px-4 py-3 text-left transition-colors hover:border-brass-400/35 hover:bg-ink-700/60 disabled:opacity-40"
            >
              <div className="min-w-0">
                <div className="text-sm text-paper-100">{s.name}</div>
                <div className="mt-0.5 truncate text-[11px] text-paper-500">{s.desc}</div>
              </div>
              <span className="mt-0.5 shrink-0 text-xs text-paper-600 transition-colors group-hover:text-brass-400">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
