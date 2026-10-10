import { describe, it, expect } from "vitest";
import { buildHealthDataMarkdown, detectAnomaly } from "./markdownExport";
import type { HealthRecord, IndicatorCategory } from "@/app/components/AddRecordDialog";

const NOW = new Date(2026, 9, 10, 21, 0);

const categories: IndicatorCategory[] = [
  {
    id: "cat_body",
    name: "人体成分分析",
    items: [
      { id: "tbw", label: "身体总水分", unit: "L" },
      { id: "minerals", label: "无机盐", unit: "kg", referenceRange: "3.4-4.4" },
    ],
  },
  {
    id: "cat_liver",
    name: "肝功能",
    items: [{ id: "alt", label: "谷丙转氨酶", unit: "U/L", referenceRange: "9-50" }],
  },
  {
    id: "cat_empty",
    name: "无数据分类",
    items: [{ id: "none", label: "不存在", unit: "" }],
  },
];

const record = (over: Partial<HealthRecord>): HealthRecord => ({
  id: `r_${Math.random()}`,
  date: "2025-12-18",
  indicatorType: "tbw",
  value: 43.7,
  unit: "L",
  ...over,
});

describe("buildHealthDataMarkdown", () => {
  it("元信息头含记录总数、异常数与数据区间", () => {
    const records = [
      record({ id: "r1", value: 43.7 }),
      record({ id: "r2", indicatorType: "minerals", value: 4.42, abnormalFlag: "H" }),
    ];

    const md = buildHealthDataMarkdown(records, categories, NOW);

    expect(md).toContain("# 个人健康数据导出");
    expect(md).toContain("- 导出时间：2026-10-10 21:00");
    expect(md).toContain("- 数据区间：2025-12-18 ~ 2025-12-18");
    expect(md).toContain("- 记录总数：2 条（异常 1 条）");
    expect(md).toContain("- 分类数：1");
  });

  it("分类表空单元格为 -、整数不补零、小数保留两位", () => {
    const records = [
      record({ id: "r1", value: 43.7 }),
      record({ id: "r2", date: "2025-12-19", value: 44 }),
      record({ id: "r3", indicatorType: "minerals", value: 4.426 }),
    ];

    const md = buildHealthDataMarkdown(records, categories, NOW);

    // 表头含单位；同日记录合并为一行；空单元格为 -；整数不补零、小数两位
    expect(md).toContain("| 数据日期 | 身体总水分 (L) | 无机盐 (kg) |");
    expect(md).toContain("| 2025-12-18 | 43.7 | 4.43 |");
    expect(md).toContain("| 2025-12-19 | 44 | - |");
  });

  it("abnormalFlag H/L 进入异常汇总且方向文案正确", () => {
    const records = [
      record({ id: "r1", indicatorType: "minerals", value: 4.42, abnormalFlag: "H" }),
      record({ id: "r2", indicatorType: "alt", value: 8, abnormalFlag: "L", unit: "U/L" }),
    ];

    const md = buildHealthDataMarkdown(records, categories, NOW);

    expect(md).toContain("## 异常指标汇总");
    expect(md).toContain("| 2025-12-18 | 无机盐 | 4.42 | kg | 偏高 ↑ | 3.4-4.4 |");
    expect(md).toContain("| 2025-12-18 | 谷丙转氨酶 | 8 | U/L | 偏低 ↓ | 9-50 |");
  });

  it("无标记但越参考范围的记录也进入异常汇总", () => {
    const records = [record({ id: "r1", indicatorType: "alt", value: 60, unit: "U/L" })];

    const md = buildHealthDataMarkdown(records, categories, NOW);

    expect(md).toContain("| 2025-12-18 | 谷丙转氨酶 | 60 | U/L | 偏高 ↑ | 9-50 |");
  });

  it("无数据分类不生成节；无异常时省略汇总节", () => {
    const records = [record({ id: "r1", value: 43.7 })];

    const md = buildHealthDataMarkdown(records, categories, NOW);

    expect(md).not.toContain("## 异常指标汇总");
    expect(md).not.toContain("## 无数据分类");
    expect(md).not.toContain("## 肝功能");
    expect(md).toContain("## 人体成分分析");
  });

  it("label 含竖线时正确转义", () => {
    const pipeCategories: IndicatorCategory[] = [
      { id: "c", name: "测试|分类", items: [{ id: "p", label: "指标|A", unit: "%" }] },
    ];
    const records = [record({ id: "r1", indicatorType: "p", value: 1, unit: "%" })];

    const md = buildHealthDataMarkdown(records, pipeCategories, NOW);

    expect(md).toContain("## 测试\\|分类");
    expect(md).toContain("指标\\|A (%)");
  });

  it("未命中分类指标项的记录被忽略（范围选择生效）", () => {
    const records = [
      record({ id: "r1", value: 43.7 }),
      record({ id: "r2", indicatorType: "unknown_item", value: 1 }),
    ];

    const md = buildHealthDataMarkdown(records, categories, NOW);

    expect(md).toContain("- 记录总数：1 条（异常 0 条）");
  });
});

describe("detectAnomaly", () => {
  it("原始标记优先于参考范围", () => {
    const r = record({ value: 3.5, abnormalFlag: "H" });
    expect(detectAnomaly(r, "3.4-4.4")).toBe("high");
  });

  it("无标记按范围越界判定", () => {
    expect(detectAnomaly(record({ value: 5 }), "3.4-4.4")).toBe("high");
    expect(detectAnomaly(record({ value: 3 }), "3.4-4.4")).toBe("low");
    expect(detectAnomaly(record({ value: 4 }), "3.4-4.4")).toBeNull();
  });

  it("无范围且无标记返回 null", () => {
    expect(detectAnomaly(record({ value: 100 }), undefined)).toBeNull();
  });
});
