import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classify, looksLikeSubscription } from "../src/domain/categories";
import { decodeBillBuffer } from "../src/domain/parse/decode";
import { parseBillBuffer, parseBillText, BillParseError } from "../src/domain/parse/csv";
import { normalizeMerchant } from "../src/domain/parse/normalize";
import { parseAmountToCents, parseTimestamp } from "../src/domain/parse/values";

const sample = (name: string) => readFileSync(resolve(process.cwd(), "samples", name));

describe("金额解析", () => {
  it("支持货币符号、千分位、中文元、括号负数", () => {
    expect(parseAmountToCents("¥1,234.50")).toBe(123450);
    expect(parseAmountToCents("￥25.00")).toBe(2500);
    expect(parseAmountToCents("12元")).toBe(1200);
    expect(parseAmountToCents("（30.00）")).toBe(3000);
    expect(parseAmountToCents("支出 88.80")).toBe(8880);
  });

  it("拒绝空值与 0 元，避免把空行算成消费", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("0.00")).toBeNull();
    expect(parseAmountToCents(undefined)).toBeNull();
  });
});

describe("时间解析", () => {
  it("覆盖常见账单时间写法", () => {
    const a = parseTimestamp("2026-10-03 12:34:56");
    expect(a?.date).toBe("2026-10-03");
    expect(a?.hour).toBe(12);

    const b = parseTimestamp("2026/10/3 08:05");
    expect(b?.date).toBe("2026-10-03");
    expect(b?.hour).toBe(8);

    const c = parseTimestamp("2026年10月3日 23:40");
    expect(c?.date).toBe("2026-10-03");
    expect(c?.hour).toBe(23);
  });

  it("非法日期不静默进位", () => {
    expect(parseTimestamp("2026-02-30 10:00")).toBeNull();
  });
});

describe("编码", () => {
  it("GBK 账单能被识别为 gb18030 而不是乱码", () => {
    const decoded = decodeBillBuffer(sample("bill-wechat-gbk.csv"));
    expect(decoded.encoding).toBe("gb18030");
    expect(decoded.text).toContain("微信支付账单明细");
    expect(decoded.text).toContain("交易时间");
  });

  it("UTF-8 BOM 会被剥离", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("交易时间,金额")]);
    const decoded = decodeBillBuffer(withBom);
    expect(decoded.encoding).toBe("utf-8-bom");
    expect(decoded.text.startsWith("交易时间")).toBe(true);
  });
});

describe("表头探测与解析", () => {
  it("跳过支付宝前置说明行，按语义找到列", () => {
    const parsed = parseBillBuffer(sample("bill-student.csv"));
    expect(parsed.detected.format).toBe("alipay");
    expect(parsed.detected.columns.time).toBe("交易时间");
    expect(parsed.detected.columns.amount).toBe("金额");
    expect(parsed.detected.columns.direction).toBe("收/支");
    expect(parsed.txns.length).toBe(43);
  });

  it("收入与支出分别汇总，且方向列不被「交易类型」抢占", () => {
    const parsed = parseBillBuffer(sample("bill-wechat-gbk.csv"));
    const income = parsed.txns.filter((t) => t.direction === "in");
    const expense = parsed.txns.filter((t) => t.direction === "out");
    expect(income.reduce((a, t) => a + t.amountCents, 0)).toBe(919900);
    expect(expense.length).toBeGreaterThan(20);
  });

  it("交易关闭的行被跳过，并给出告警", () => {
    const parsed = parseBillBuffer(sample("bill-wechat-gbk.csv"));
    expect(parsed.warnings.some((w) => w.code === "SKIPPED_ROWS")).toBe(true);
    expect(parsed.txns.some((t) => t.note?.includes("T恤"))).toBe(false);
  });

  it("缺少时间/金额列时明确报错，而不是返回空结果", () => {
    expect(() => parseBillText("商户,备注\n星巴克,咖啡")).toThrow(BillParseError);
  });

  it("多月份账单只保留流水最多的月份", () => {
    const csv = [
      "交易时间,交易对方,商品说明,收/支,金额",
      "2026-10-01 12:00:00,食堂,午餐,支出,12.00",
      "2026-10-02 12:00:00,食堂,午餐,支出,12.00",
      "2026-11-01 12:00:00,食堂,午餐,支出,12.00",
    ].join("\n");
    const parsed = parseBillText(csv);
    expect(parsed.txns.every((t) => t.date.startsWith("2026-10"))).toBe(true);
    expect(parsed.warnings.some((w) => w.code === "MULTI_MONTH")).toBe(true);
  });
});

describe("分类与归一化", () => {
  it("分类命中关键商户，且「必须」与「可选」分得清", () => {
    expect(classify("out", "校园食堂", "午餐", "支出")).toBe("food");
    expect(classify("out", "房东王姐", "10月房租", "支出")).toBe("housing");
    expect(classify("out", "昆明地铁", "地铁", "支出")).toBe("transport");
    expect(classify("out", "淘宝", "蓝牙耳机", "支出")).toBe("shopping");
    expect(classify("out", "淘宝", "朋友生日礼物", "支出")).toBe("social");
    expect(classify("out", "腾讯视频", "会员续费", "支出")).toBe("subscription");
    expect(classify("out", "京东", "电饭煲", "支出")).toBe("shopping");
  });

  it("资金搬运不算消费", () => {
    expect(classify("out", "余额宝", "转入", "支出")).toBe("transfer");
    expect(classify("out", "信用卡还款", "还款", "支出")).toBe("transfer");
  });

  it("订阅识别不会被「地铁月卡 / 健身年卡」误伤", () => {
    expect(looksLikeSubscription("腾讯视频", "会员续费")).toBe(true);
    expect(looksLikeSubscription("昆明地铁", "地铁月卡")).toBe(false);
    expect(looksLikeSubscription("乐刻健身", "健身年卡")).toBe(false);
  });

  it("商户归一化把同一家店的不同写法收敛成一个键", () => {
    const a = normalizeMerchant("支付宝-美团外卖（北京）有限公司");
    const b = normalizeMerchant("财付通-美团外卖****旗舰店");
    expect(a).toBe(b);
  });
});
