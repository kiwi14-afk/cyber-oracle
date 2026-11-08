/**
 * 值解析：金额 → 分，时间 → epoch 毫秒
 * ------------------------------------------------------------------
 * 各平台账单的格式都不同，这里不做「一次性正则」，而是分模式表：
 * 解析失败的返回 null，由上层统一计入 skippedRows 并给出告警，
 * 绝不因为一行脏数据把整张账单丢掉。
 */

export interface ParsedTime {
  ts: number;
  date: string;
  hour: number;
}

/** 金额字符串 → 分（正整数）。无法解析返回 null */
export function parseAmountToCents(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(Math.abs(input) * 100);
  }
  let s = String(input).trim();
  if (!s) return null;

  // 会计写法 (12.00) 表示负数
  const negativeByParen = /^[(（].*[)）]$/.test(s);
  s = s
    .replace(/[¥￥$]/g, "")
    .replace(/(人民币|元|CNY|RMB)/gi, "")
    .replace(/[,，\s\u3000]/g, "")
    .replace(/[(（）)]/g, "");

  // 有些账单会写成 "12.00(支出)" 或 "支出12.00"
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const num = Number(m[0]);
  if (!Number.isFinite(num)) return null;
  const cents = Math.round(Math.abs(num) * 100);
  if (cents === 0) return null;
  return negativeByParen ? cents : cents;
}

/** 金额字符串是否显式带负号（用于推断收支方向） */
export function hasNegativeSign(input: unknown): boolean {
  if (typeof input === "number") return input < 0;
  const s = String(input ?? "");
  return /^[-−(（]/.test(s.trim());
}

/**
 * 时间解析。支持：
 *   2026-10-03 12:34:56 / 2026/10/3 12:34 / 2026.10.03 12:34
 *   2026年10月3日 12:34:56
 *   20261003（无时间，默认 12:00）
 *   20261003123456（14 位）
 *   Excel 序列号（如 46200.5）
 */
export function parseTimestamp(input: unknown): ParsedTime | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Excel 序列号：1900 起算，1899-12-30 为基准
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 30000 && serial < 60000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        // 序列号按 UTC 存，转本地日期时用 UTC 取日期部分
        const y = d.getUTCFullYear();
        const mo = d.getUTCMonth();
        const day = d.getUTCDate();
        const hour = d.getUTCHours();
        const local = new Date(y, mo, day, hour, 0, 0);
        return { ts: local.getTime(), date: fmtDate(local), hour };
      }
    }
  }

  // 纯数字：8 位 / 14 位
  if (/^\d{8}$/.test(raw)) {
    return build(+raw.slice(0, 4), +raw.slice(4, 6), +raw.slice(6, 8), 12, 0, 0);
  }
  if (/^\d{14}$/.test(raw)) {
    return build(
      +raw.slice(0, 4),
      +raw.slice(4, 6),
      +raw.slice(6, 8),
      +raw.slice(8, 10),
      +raw.slice(10, 12),
      +raw.slice(12, 14),
    );
  }

  // 通用：年 月 日 [时 分 [秒]]
  const m = raw.match(
    /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s*(?:[T ]?\s*(\d{1,2})\s*[:：时]\s*(\d{1,2})(?:\s*[:：分]\s*(\d{1,2}))?)?/,
  );
  if (m) {
    const season = raw.includes("上午") || raw.includes("下午");
    let hour = m[4] ? +m[4] : 12;
    if (season && raw.includes("下午") && hour < 12) hour += 12;
    return build(+m[1], +m[2], +m[3], hour, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  }

  // 兜底：交给 Date 解析（ISO 带时区的情况走这里）
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() > 1970) {
    return { ts: d.getTime(), date: fmtDate(d), hour: d.getHours() };
  }
  return null;
}

function build(y: number, mo: number, day: number, h: number, mi: number, s: number): ParsedTime | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  const d = new Date(y, mo - 1, day, h, mi, s, 0);
  if (Number.isNaN(d.getTime())) return null;
  // 防止 2 月 30 日这类非法日期被 Date 自动进位
  if (d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
  return { ts: d.getTime(), date: fmtDate(d), hour: h };
}

export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 分 → 展示字符串，四舍五入到分 */
export function formatCents(cents: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const abs = Math.abs(cents) / 100;
  if (opts.compact && abs >= 10000) {
    return `¥${(abs / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`;
  }
  const body = abs.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = opts.sign ? (cents > 0 ? "+" : cents < 0 ? "-" : "") : cents < 0 ? "-" : "";
  return `${sign}¥${body}`;
}
