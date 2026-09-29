import { describe, it, expect } from "vitest";
import {
  parseReferenceRange,
  getValueStatus,
  scoreAgainstRange,
} from "@/app/services/referenceRange";

describe("parseReferenceRange", () => {
  it("解析双侧连字符 3.9-6.1", () => {
    expect(parseReferenceRange("3.9-6.1")).toEqual({ min: 3.9, max: 6.1 });
  });

  it("解析带空格的双侧 4.0 - 10.0", () => {
    expect(parseReferenceRange("4.0 - 10.0")).toEqual({ min: 4.0, max: 10.0 });
  });

  it("解析半角波浪 2.8~5.7", () => {
    expect(parseReferenceRange("2.8~5.7")).toEqual({ min: 2.8, max: 5.7 });
  });

  it("解析全角波浪 3.9～6.1", () => {
    expect(parseReferenceRange("3.9～6.1")).toEqual({ min: 3.9, max: 6.1 });
  });

  it("解析 en dash 3.9–6.1", () => {
    expect(parseReferenceRange("3.9–6.1")).toEqual({ min: 3.9, max: 6.1 });
  });

  it("解析 em dash 3.9—6.1", () => {
    expect(parseReferenceRange("3.9—6.1")).toEqual({ min: 3.9, max: 6.1 });
  });

  it("解析全角连字符 3.9－6.1", () => {
    expect(parseReferenceRange("3.9－6.1")).toEqual({ min: 3.9, max: 6.1 });
  });

  it("解析单侧上限 <5.2", () => {
    expect(parseReferenceRange("<5.2")).toEqual({ max: 5.2 });
  });

  it("解析单侧上限 ≤5.2", () => {
    expect(parseReferenceRange("≤5.2")).toEqual({ max: 5.2 });
  });

  it("解析全角小于 ＜5.2", () => {
    expect(parseReferenceRange("＜5.2")).toEqual({ max: 5.2 });
  });

  it("解析中文上限 5.2以下", () => {
    expect(parseReferenceRange("5.2以下")).toEqual({ max: 5.2 });
  });

  it("解析单侧下限 >200", () => {
    expect(parseReferenceRange(">200")).toEqual({ min: 200 });
  });

  it("解析单侧下限 ≥150", () => {
    expect(parseReferenceRange("≥150")).toEqual({ min: 150 });
  });

  it("解析全角大于 ＞3.0", () => {
    expect(parseReferenceRange("＞3.0")).toEqual({ min: 3.0 });
  });

  it("解析中文下限 150以上", () => {
    expect(parseReferenceRange("150以上")).toEqual({ min: 150 });
  });

  it("忽略单位与说明文字：<5.2 mmol/L", () => {
    expect(parseReferenceRange("<5.2 mmol/L")).toEqual({ max: 5.2 });
  });

  it("忽略单位：100 - 300 ×10⁹/L", () => {
    expect(parseReferenceRange("100 - 300 ×10⁹/L")).toEqual({ min: 100, max: 300 });
  });

  it("比较符后带空格：≤ 5.2", () => {
    expect(parseReferenceRange("≤ 5.2")).toEqual({ max: 5.2 });
  });

  it("乱序时交换保证 min ≤ max", () => {
    expect(parseReferenceRange("6.1-3.9")).toEqual({ min: 3.9, max: 6.1 });
  });

  it("不可解析文本返回 null：阴性", () => {
    expect(parseReferenceRange("阴性")).toBeNull();
  });

  it("空字符串返回 null", () => {
    expect(parseReferenceRange("")).toBeNull();
  });

  it("undefined 返回 null", () => {
    expect(parseReferenceRange(undefined)).toBeNull();
  });

  it("说明文字返回 null：见报告", () => {
    expect(parseReferenceRange("见报告")).toBeNull();
  });
});

describe("getValueStatus", () => {
  it("LDL 案例：无范围但 flag=H → above", () => {
    expect(getValueStatus(4.01, undefined, "H")).toBe("above");
  });

  it("无范围但 flag=L → below", () => {
    expect(getValueStatus(2.5, undefined, "L")).toBe("below");
  });

  it("单侧 <3.4：超出上限 → above", () => {
    expect(getValueStatus(4.0, "<3.4")).toBe("above");
  });

  it("单侧 <3.4：范围内 → normal", () => {
    expect(getValueStatus(3.0, "<3.4")).toBe("normal");
  });

  it("单侧 >40：低于下限 → below", () => {
    expect(getValueStatus(30, ">40")).toBe("below");
  });

  it("单侧 >40：范围内 → normal", () => {
    expect(getValueStatus(50, ">40")).toBe("normal");
  });

  it("无范围无 flag → unknown", () => {
    expect(getValueStatus(5.0)).toBe("unknown");
  });

  it("范围不可解析且无 flag → unknown", () => {
    expect(getValueStatus(5.0, "阴性")).toBe("unknown");
  });

  it("value 为 undefined → unknown（即使给了范围）", () => {
    expect(getValueStatus(undefined, "3.9-6.1", "H")).toBe("unknown");
  });

  it("value 为 NaN → unknown（即使给了范围）", () => {
    expect(getValueStatus(NaN, "3.9-6.1", "H")).toBe("unknown");
  });

  it("value 为字符串 → unknown（即使给了范围）", () => {
    expect(getValueStatus("abc", "3.9-6.1", "H")).toBe("unknown");
  });

  it("value 为 Infinity → unknown", () => {
    expect(getValueStatus(Infinity, "3.9-6.1")).toBe("unknown");
  });

  it("范围优先于 flag：范围内 normal 即使 flag=H", () => {
    expect(getValueStatus(5.0, "3.9-6.1", "H")).toBe("normal");
  });
});

describe("scoreAgainstRange", () => {
  it("双侧居中 ≈ 100", () => {
    expect(scoreAgainstRange(5.0, "0-10")).toBeCloseTo(100, 5);
  });

  it("双侧边缘 = 60", () => {
    expect(scoreAgainstRange(0, "0-10")).toBeCloseTo(60, 5);
    expect(scoreAgainstRange(10, "0-10")).toBeCloseTo(60, 5);
  });

  it("双侧超出 span 一半 ≈ 0", () => {
    expect(scoreAgainstRange(15, "0-10")).toBeCloseTo(0, 5);
    expect(scoreAgainstRange(-5, "0-10")).toBeCloseTo(0, 5);
  });

  it("单侧上限：4.01 vs <3.4 得分 <80", () => {
    const s = scoreAgainstRange(4.01, "<3.4");
    expect(s).not.toBeNull();
    expect(s!).toBeLessThan(80);
  });

  it("单侧上限：得分随超出递减", () => {
    const s1 = scoreAgainstRange(4.01, "<3.4")!;
    const s2 = scoreAgainstRange(5.0, "<3.4")!;
    expect(s2).toBeLessThan(s1);
  });

  it("单侧上限：3.0 vs <3.4 得分 >90", () => {
    const s = scoreAgainstRange(3.0, "<3.4");
    expect(s).not.toBeNull();
    expect(s!).toBeGreaterThan(90);
  });

  it("无范围 → null", () => {
    expect(scoreAgainstRange(5.0)).toBeNull();
  });

  it("范围不可解析 → null", () => {
    expect(scoreAgainstRange(5.0, "阴性")).toBeNull();
  });

  it("非数值 value → null", () => {
    expect(scoreAgainstRange("abc", "3.9-6.1")).toBeNull();
    expect(scoreAgainstRange(undefined, "3.9-6.1")).toBeNull();
    expect(scoreAgainstRange(NaN, "3.9-6.1")).toBeNull();
  });
});
