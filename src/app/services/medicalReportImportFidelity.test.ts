import { describe, it, expect } from "vitest";
import { resolveIndicators, type ExtractedIndicator } from "@/app/services/medicalReport";

// 复现 2026-09 数据失真场景：用户默认血脂库 + 体检报告血脂五项 + 心电图 QT/QTc、P-R
const userCats = [
  {
    id: "cholesterolPanel",
    name: "血脂",
    items: [
      { id: "cholesterol", label: "总胆固醇", unit: "mmol/L" },
      { id: "triglycerides", label: "甘油三酯", unit: "mmol/L" },
      { id: "ldl", label: "低密度脂蛋白", unit: "mmol/L" },
      { id: "hdl", label: "高密度脂蛋白", unit: "mmol/L" },
    ],
  },
  {
    id: "bloodPressure",
    name: "血压",
    items: [
      { id: "bloodPressureHigh", label: "收缩压 (高压)", unit: "mmHg" },
      { id: "bloodPressureLow", label: "舒张压 (低压)", unit: "mmHg" },
    ],
  },
];

describe("bug 复现：血脂五项 + 心电图间期不再塌缩/误配", () => {
  const extracted: ExtractedIndicator[] = [
    { rawLabel: "总胆固醇", value: 5.86, unit: "mmol/L", pageIndex: 0, abnormalFlag: "H" },
    { rawLabel: "甘油三酯", value: 1.02, unit: "mmol/L", pageIndex: 0 },
    { rawLabel: "低密度脂蛋白胆固醇", value: 4.01, unit: "mmol/L", pageIndex: 0, abnormalFlag: "H" },
    { rawLabel: "高密度脂蛋白胆固醇", value: 1.36, unit: "mmol/L", pageIndex: 0 },
    { rawLabel: "非高密度脂蛋白胆固醇", value: 4.5, unit: "mmol/L", pageIndex: 0, abnormalFlag: "H" },
    { rawLabel: "QT/QTc", value: 362, unit: "ms", pageIndex: 0 },
    { rawLabel: "P-R间期", value: 156, unit: "ms", pageIndex: 0 },
  ];

  const resolved = resolveIndicators(extracted, userCats as never);

  it("五项血脂各自落到正确的用户指标项，无塌缩", () => {
    expect(resolved[0].systemId).toBe("cholesterol");
    expect(resolved[1].systemId).toBe("triglycerides");
    expect(resolved[2].systemId).toBe("ldl");
    expect(resolved[3].systemId).toBe("hdl");
    // 非高密度脂蛋白胆固醇是独立指标，不得并入 hdl/cholesterol
    expect(resolved[4].systemId).not.toBe("hdl");
    expect(resolved[4].systemId).not.toBe("cholesterol");
  });

  it("导入类记录不含心电图间期（ms 单位全部拒绝）", () => {
    // 用户库只有 总胆固醇/甘油三酯/低密度/高密度 四项；
    // 非高密度脂蛋白胆固醇 不在库中，不得误导入这四项中的任何一个
    const imported = resolved.filter(r => r.action === "import");
    expect(imported).toHaveLength(4);
    expect(imported.some(r => r.systemId === "bloodPressureHigh")).toBe(false);
    expect(resolved[5].matchType).toBe("none");
    expect(resolved[6].matchType).toBe("none");
  });

  it("预览到入库数值一致（总胆固醇 5.86↑ 不变成 362）", () => {
    const tc = resolved.find(r => r.systemId === "cholesterol");
    expect(tc?.value).toBe(5.86);
    expect(tc?.abnormalFlag).toBe("H");
  });
});
