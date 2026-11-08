import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOracle } from "../src/domain/oracle";
import { parseBillBuffer } from "../src/domain/parse/csv";
import { buildLedger } from "../src/domain/ledger";
import { hexSymbol, trigramOf } from "../src/domain/hexagram";

const oracleOf = (file: string, options = {}) => buildOracle(parseBillBuffer(readFileSync(resolve(process.cwd(), "samples", file))), options);

describe("六十四卦映射", () => {
  it("八卦编码自下而上，与爻位一致", () => {
    expect(trigramOf(true, true, true)).toBe("乾");
    expect(trigramOf(true, true, false)).toBe("兑");
    expect(trigramOf(true, false, true)).toBe("离");
    expect(trigramOf(true, false, false)).toBe("震");
    expect(trigramOf(false, true, true)).toBe("巽");
    expect(trigramOf(false, true, false)).toBe("坎");
    expect(trigramOf(false, false, true)).toBe("艮");
    expect(trigramOf(false, false, false)).toBe("坤");
  });

  it("卦符与文王卦序对齐", () => {
    expect(hexSymbol(1)).toBe("䷀");
    expect(hexSymbol(2)).toBe("䷁");
    expect(hexSymbol(64)).toBe("䷿");
  });
});

describe("端到端：四份样例账单", () => {
  it("学生账单：风火家人，情绪与订阅两处漏", () => {
    const o = oracleOf("bill-student.csv");
    expect(o.ledger.incomeCents).toBe(230000);
    expect(o.ledger.expenseCents).toBe(136790);
    expect(o.hexagram.id).toBe(37);
    expect(o.hexagram.name).toBe("风火家人");
    expect(o.hexagram.leakCount).toBe(2);
    expect(o.persona.name).toBe("情绪结算员");
    expect(o.runway.burnoutDay).toBeNull();
    expect(o.prescriptions).toHaveLength(3);
  });

  it("月光账单：六爻全阴取坤为地，第 23 天见底", () => {
    const o = oracleOf("bill-moonlight.csv");
    expect(o.ledger.expenseCents).toBe(664700);
    expect(o.hexagram.id).toBe(2);
    expect(o.hexagram.name).toBe("坤为地");
    expect(o.hexagram.leakCount).toBe(6);
    expect(o.persona.name).toBe("赛博散财童子");
    expect(o.runway.burnoutDay).toBe(23);
    // 全月支出 6647 已经超过收入 6200，属于「月末确实超支」
    expect(o.runway.alreadyOver).toBe(true);
  });

  it("稳健账单：六爻纯阳取乾为天", () => {
    const o = oracleOf("bill-steady.csv");
    expect(o.hexagram.id).toBe(1);
    expect(o.hexagram.name).toBe("乾为天");
    expect(o.hexagram.leakCount).toBe(0);
    expect(o.persona.name).toBe("铁算盘");
    expect(o.hexagram.judgement).toContain("六爻纯阳");
  });

  it("微信 GBK 账单：方向与收入解析正确", () => {
    const o = oracleOf("bill-wechat-gbk.csv");
    expect(o.ledger.incomeCents).toBe(919900);
    expect(o.ledger.expenseCents).toBe(112690);
    expect(o.hexagram.id).toBe(25);
    expect(o.hexagram.name).toBe("天雷无妄");
  });
});

describe("确定性与边界", () => {
  it("同一份账单两次计算，结果逐字节一致", () => {
    const a = JSON.stringify(oracleOf("bill-student.csv"));
    const b = JSON.stringify(oracleOf("bill-student.csv"));
    expect(a).toBe(b);
  });

  it("手填预算会覆盖收入推算，并改变燃尽日", () => {
    const base = oracleOf("bill-steady.csv");
    const tight = oracleOf("bill-steady.csv", { budgetCentsOverride: 300000 });
    expect(tight.runway.budgetSource).toBe("custom");
    expect(tight.runway.budgetCents).toBe(300000);
    expect(tight.runway.burnoutDay).not.toBeNull();
    expect(tight.runway.burnoutDay).toBeLessThanOrEqual(base.ledger.daysInMonth);
  });

  it("燃尽曲线长度等于当月天数且单调不减", () => {
    const o = oracleOf("bill-moonlight.csv");
    expect(o.runway.points).toHaveLength(o.ledger.daysInMonth);
    for (let i = 1; i < o.runway.points.length; i++) {
      expect(o.runway.points[i]!.projectedCents).toBeGreaterThanOrEqual(o.runway.points[i - 1]!.projectedCents);
    }
  });

  it("资金搬运不进入支出统计", () => {
    const parsed = parseBillBuffer(readFileSync(resolve(process.cwd(), "samples", "bill-student.csv")));
    const withTransfer = [...parsed.txns, {
      ...parsed.txns[0]!,
      id: "transfer-1",
      merchant: "信用卡还款",
      note: "还款",
      category: "transfer" as const,
      amountCents: 500000,
      direction: "out" as const,
    }];
    const ledger = buildLedger(withTransfer);
    expect(ledger.expenseCents).toBe(136790);
  });

  it("空账单不会凭空造出一个卦", () => {
    const ledger = buildLedger([]);
    expect(ledger.expenseCents).toBe(0);
    const o = buildOracle({ txns: [], totalRows: 0, skippedRows: 0, warnings: [], detected: { format: "generic", encoding: "utf-8", columns: {} } });
    expect(o.hexagram.id).toBe(0);
    expect(o.hexagram.name).toBe("无卦");
    expect(o.prescriptions).toHaveLength(0);
    expect(o.persona.key).toBe("no-ledger");
  });
});
