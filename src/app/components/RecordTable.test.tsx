import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecordTable } from "@/app/components/RecordTable";
import type { HealthRecord, IndicatorItem } from "@/app/components/AddRecordDialog";

const indicators: IndicatorItem[] = [
  { id: "glucose", label: "血糖", unit: "mmol/L", referenceRange: "3.9-6.1" },
  { id: "wbc", label: "白细胞", unit: "×10⁹/L" },
];

const renderTable = (records: HealthRecord[]) =>
  render(
    <RecordTable
      records={records}
      indicators={indicators}
      onDeleteRecord={vi.fn()}
      onUpdateRecord={vi.fn()}
      onAddFollowupRecord={vi.fn()}
    />,
  );

/** 取数值 pill 所在的值单元格容器（箭头与数值同行） */
const valueCellOf = (valueText: string) => screen.getByText(valueText).parentElement as HTMLElement;

describe("RecordTable 报告原始异常方向箭头", () => {
  it("abnormalFlag H 显示红色 ↑，L 显示蓝色 ↓", () => {
    renderTable([
      { id: "r1", date: "2024-01-02", indicatorType: "glucose", value: 7.2, unit: "mmol/L", abnormalFlag: "H" },
      { id: "r2", date: "2024-01-01", indicatorType: "wbc", value: 3.1, unit: "×10⁹/L", abnormalFlag: "L" },
    ]);

    const highArrow = valueCellOf("7.2 mmol/L").querySelector('[aria-label="偏高"]');
    expect(highArrow).toBeTruthy();
    expect(highArrow?.classList.contains("text-red-500")).toBe(true);

    const lowArrow = valueCellOf("3.1 ×10⁹/L").querySelector('[aria-label="偏低"]');
    expect(lowArrow).toBeTruthy();
    expect(lowArrow?.classList.contains("text-blue-500")).toBe(true);
  });

  it("无 abnormalFlag 且数值在参考范围内时不渲染箭头", () => {
    renderTable([
      { id: "r1", date: "2024-01-01", indicatorType: "glucose", value: 5, unit: "mmol/L" },
    ]);

    expect(valueCellOf("5 mmol/L").querySelectorAll("svg")).toHaveLength(0);
  });

  it("abnormalFlag 优先于参考范围箭头（低于范围但报告标 H 时仍显示 ↑）", () => {
    renderTable([
      { id: "r1", date: "2024-01-01", indicatorType: "glucose", value: 3, unit: "mmol/L", abnormalFlag: "H" },
    ]);

    const cell = valueCellOf("3 mmol/L");
    expect(cell.querySelector('[aria-label="偏高"]')).toBeTruthy();
    expect(cell.querySelectorAll("svg")).toHaveLength(1);
  });
});
