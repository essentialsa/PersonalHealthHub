/**
 * 健康数据结构化 Markdown 导出（纯函数）：供本地留存、任意 AI 读取分析。
 * 结构：元信息头 + 异常指标汇总（可选）+ 分类布局为每分类一张透视表（日期 × 指标），
 * 时间线布局为按日期升序的逐日长表节。
 */
import type { HealthRecord, IndicatorCategory, IndicatorItem } from "@/app/components/AddRecordDialog";
import { parseReferenceRange } from "@/app/services/referenceRange";

export type AnomalyDirection = "high" | "low";

/** 导出布局：按分类透视表 或 按时间线逐日长表 */
export type MarkdownLayout = "category" | "timeline";

/** Markdown 表格单元格转义：竖线破坏表格结构，换行压成空格 */
const escapeCell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** 与现有导出口径一致：整数不补零，其余保留两位小数 */
const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().split("T")[0];
};

const formatNow = (now: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const itemHeader = (item: IndicatorItem): string => (item.unit ? `${item.label} (${item.unit})` : item.label);

/**
 * 异常判定：报告原始标记（H/L）优先；无标记时按参考范围越界补充判定。
 */
export const detectAnomaly = (record: HealthRecord, referenceRange?: string): AnomalyDirection | null => {
  if (record.abnormalFlag === "H") return "high";
  if (record.abnormalFlag === "L") return "low";
  const range = parseReferenceRange(referenceRange);
  if (!range) return null;
  if (range.max !== undefined && record.value > range.max) return "high";
  if (range.min !== undefined && record.value < range.min) return "low";
  return null;
};

export function buildHealthDataMarkdown(
  records: HealthRecord[],
  categories: IndicatorCategory[],
  now: Date = new Date(),
  layout: MarkdownLayout = "category",
): string {
  const itemById = new Map<string, { item: IndicatorItem; categoryName: string }>();
  for (const category of categories) {
    for (const item of category.items) {
      if (!itemById.has(item.id)) {
        itemById.set(item.id, { item, categoryName: category.name });
      }
    }
  }

  // 仅保留命中所选分类指标项的记录，范围选择对 Markdown 同样生效
  const knownRecords = records.filter(record => itemById.has(record.indicatorType));

  const anomalies: Array<{
    record: HealthRecord;
    label: string;
    unit: string;
    referenceRange: string;
    direction: AnomalyDirection;
  }> = [];
  for (const record of knownRecords) {
    const { item } = itemById.get(record.indicatorType)!;
    const direction = detectAnomaly(record, item.referenceRange);
    if (direction) {
      anomalies.push({
        record,
        label: item.label,
        unit: item.unit,
        referenceRange: item.referenceRange?.trim() || "-",
        direction,
      });
    }
  }
  anomalies.sort((a, b) => new Date(a.record.date).getTime() - new Date(b.record.date).getTime());

  const sections: string[] = [];
  for (const category of categories) {
    const categoryRecords = knownRecords.filter(record =>
      category.items.some(item => item.id === record.indicatorType),
    );
    if (categoryRecords.length === 0) continue;

    // 同日期+同指标重复记录：与现有导出口径一致，后写入覆盖
    const recordMap = new Map<string, HealthRecord>();
    categoryRecords.forEach(record => recordMap.set(`${formatDate(record.date)}__${record.indicatorType}`, record));
    const uniqueDates = Array.from(new Set(categoryRecords.map(record => formatDate(record.date)))).sort();

    const header = ["数据日期", ...category.items.map(itemHeader)];
    const body = uniqueDates.map(date => [
      date,
      ...category.items.map(item => {
        const record = recordMap.get(`${date}__${item.id}`);
        return record ? formatNumber(record.value) : "-";
      }),
    ]);

    sections.push(
      [
        `## ${escapeCell(category.name)}`,
        "",
        `| ${header.map(escapeCell).join(" | ")} |`,
        `|${header.map(() => "---").join("|")}|`,
        ...body.map(row => `| ${row.map(escapeCell).join(" | ")} |`),
      ].join("\n"),
    );
  }

  // 时间线布局：逐日一节，日期升序；行顺序按分类顺序 → 分类内指标顺序稳定排列
  const timelineSections: string[] = [];
  if (layout === "timeline") {
    // 与分类布局 recordMap 口径一致：同日期+同指标重复记录后写入覆盖
    const timelineRecordMap = new Map<string, HealthRecord>();
    knownRecords.forEach(record => timelineRecordMap.set(`${formatDate(record.date)}__${record.indicatorType}`, record));
    const timelineDates = Array.from(new Set(knownRecords.map(record => formatDate(record.date)))).sort();

    for (const date of timelineDates) {
      const rows: string[] = [];
      for (const category of categories) {
        for (const item of category.items) {
          const record = timelineRecordMap.get(`${date}__${item.id}`);
          if (!record) continue;
          const direction = detectAnomaly(record, item.referenceRange);
          rows.push(
            `| ${escapeCell(item.label)} | ${formatNumber(record.value)} | ${escapeCell(item.unit || "-")} | ${direction === "high" ? "偏高 ↑" : direction === "low" ? "偏低 ↓" : ""} | ${escapeCell(item.referenceRange?.trim() || "-")} |`,
          );
        }
      }
      timelineSections.push(
        [
          `## ${escapeCell(date)}`,
          "",
          "| 指标 | 数值 | 单位 | 方向 | 参考范围 |",
          "|---|---|---|---|---|",
          ...rows,
        ].join("\n"),
      );
    }
  }

  const formattedDates = knownRecords.map(record => formatDate(record.date)).sort();
  const rangeText = formattedDates.length > 0
    ? `${formattedDates[0]} ~ ${formattedDates[formattedDates.length - 1]}`
    : "-";

  const blocks: string[] = [];
  blocks.push(
    [
      "# 个人健康数据导出",
      "",
      `- 导出时间：${formatNow(now)}`,
      `- 数据区间：${rangeText}`,
      `- 记录总数：${knownRecords.length} 条（异常 ${anomalies.length} 条）`,
      `- 分类数：${sections.length}`,
      `- 布局：${layout === "category" ? "按分类" : "按时间线"}`,
    ].join("\n"),
  );

  if (anomalies.length > 0) {
    blocks.push(
      [
        "## 异常指标汇总",
        "",
        "| 日期 | 指标 | 数值 | 单位 | 方向 | 参考范围 |",
        "|---|---|---|---|---|---|",
        ...anomalies.map(a =>
          `| ${formatDate(a.record.date)} | ${escapeCell(a.label)} | ${formatNumber(a.record.value)} | ${escapeCell(a.unit || "-")} | ${a.direction === "high" ? "偏高 ↑" : "偏低 ↓"} | ${escapeCell(a.referenceRange)} |`,
        ),
      ].join("\n"),
    );
  }

  blocks.push(...(layout === "timeline" ? timelineSections : sections));

  return `${blocks.join("\n\n")}\n`;
}
