/**
 * Spec Task 3：Markdown 导出容量测算性能测试。
 * 4 种数据规模 × 2 种布局：计时（单次）+ 统计字符数/字节数，
 * 并断言回归基线（规模 A 分类布局 < 50KB）、规模 D 上限（< 15s 且 < 100MB）。
 * 合成数据全部使用确定值，保证可复现。
 */
import { describe, expect, it } from "vitest";
import { buildHealthDataMarkdown } from "./markdownExport";
import type { HealthRecord, IndicatorCategory, IndicatorItem } from "@/app/components/AddRecordDialog";

const NOW = new Date(2026, 9, 10, 21, 0);
const UNITS = ["mmol/L", "kg", "%", ""];
const LAYOUTS = ["category", "timeline"] as const;

/** 39 个分类、共 165 个指标项（9 分类 × 5 项 + 30 分类 × 4 项） */
const buildCategories = (): IndicatorCategory[] => {
  const categories: IndicatorCategory[] = [];
  let itemIndex = 0;
  for (let c = 0; c < 39; c++) {
    const itemCount = c < 9 ? 5 : 4;
    const items: IndicatorItem[] = Array.from({ length: itemCount }, () => {
      const i = itemIndex++;
      return {
        id: `ind_${i}`,
        label: `指标${i}`,
        unit: UNITS[i % UNITS.length],
        referenceRange: i % 4 === 0 ? "3.4-4.4" : undefined,
      };
    });
    categories.push({ id: `cat_${c}`, name: `分类${c}`, items });
  }
  return categories;
};

const dateAt = (dayOffset: number): string =>
  new Date(Date.UTC(2025, 11, 18 + dayOffset)).toISOString().slice(0, 10);

const DATES_3650 = Array.from({ length: 3650 }, (_, d) => dateAt(d));

/** 确定值合成：value = (i % 97) / 10 + 1；约 5% 记录带 abnormalFlag（H/L 各约 2.5%） */
const buildRecords = (dates: string[], itemCount: number): HealthRecord[] => {
  const records: HealthRecord[] = [];
  let seq = 0;
  for (const date of dates) {
    for (let i = 0; i < itemCount; i++) {
      seq++;
      records.push({
        id: `r_${seq}`,
        date,
        indicatorType: `ind_${i}`,
        value: (i % 97) / 10 + 1,
        unit: UNITS[i % UNITS.length],
        abnormalFlag: seq % 40 === 0 ? "H" : seq % 40 === 20 ? "L" : undefined,
      });
    }
  }
  return records;
};

describe("markdownExport 容量测算（Spec Task 3）", () => {
  it("4 规模 × 2 布局：生成耗时与产物体积在容量上限内", () => {
    const categories = buildCategories();
    const scales = [
      { name: "规模A", records: buildRecords([dateAt(0)], 165) },
      { name: "规模B", records: buildRecords(DATES_3650.slice(0, 10), 165) },
      { name: "规模C", records: buildRecords(DATES_3650, 3) },
      { name: "规模D", records: buildRecords(DATES_3650, 164) },
    ];
    const results = new Map<string, { bytes: number; ms: number }>();

    for (const scale of scales) {
      for (const layout of LAYOUTS) {
        const started = performance.now();
        const md = buildHealthDataMarkdown(scale.records, categories, NOW, layout);
        const ms = performance.now() - started;
        const bytes = new TextEncoder().encode(md).length;
        results.set(`${scale.name}|${layout}`, { bytes, ms });

        const size = bytes > 1024 * 1024
          ? `${(bytes / 1024 / 1024).toFixed(2)}MB`
          : `${(bytes / 1024).toFixed(1)}KB`;
        console.log(`[perf] ${scale.name} ${layout}: ${scale.records.length}条 → ${size} / ${ms.toFixed(0)}ms`);

        expect(md.length).toBeGreaterThan(0);
        expect(md.startsWith("# 个人健康数据导出")).toBe(true);
      }
    }

    // 回归基线：规模 A 分类布局 < 50KB
    expect(results.get("规模A|category")!.bytes).toBeLessThan(50 * 1024);
    // 规模 D 两种布局：耗时 < 15s 且字节数 < 100MB
    for (const layout of LAYOUTS) {
      const r = results.get(`规模D|${layout}`)!;
      expect(r.ms).toBeLessThan(15000);
      expect(r.bytes).toBeLessThan(100 * 1024 * 1024);
    }
  }, 60000);
});
