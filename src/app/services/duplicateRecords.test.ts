import { describe, it, expect } from "vitest";
import { findDuplicateRecords, recordDuplicateKey } from "@/app/services/duplicateRecords";

const record = (overrides: Partial<{ id: string; date: string; indicatorType: string; value: number; unit: string }> = {}) => ({
  id: "r1",
  date: "2026-08-30",
  indicatorType: "blood_pressure_systolic",
  value: 120,
  unit: "mmHg",
  ...overrides,
});

describe("recordDuplicateKey", () => {
  it("builds key from date, indicatorType and value", () => {
    expect(recordDuplicateKey({ date: "2026-08-30", indicatorType: "sbp", value: 120 })).toBe("2026-08-30::sbp::120");
  });
});

describe("findDuplicateRecords", () => {
  it("flags records identical to existing ones (same report imported twice)", () => {
    const existing = [record(), record({ id: "r2", indicatorType: "blood_glucose", value: 5.2 })];
    const incoming = [
      record({ id: "n1" }), // 完全相同的日期+指标+数值 → 重复
      record({ id: "n2", value: 125 }), // 数值不同 → 非重复
      record({ id: "n3", date: "2026-08-31" }), // 日期不同 → 非重复
      record({ id: "n4", indicatorType: "blood_glucose", value: 5.2 }), // 与第二条重复
    ];
    const duplicates = findDuplicateRecords(incoming, existing);
    expect(duplicates.map(r => r.id)).toEqual(["n1", "n4"]);
  });

  it("returns empty when nothing matches", () => {
    const existing = [record()];
    const incoming = [record({ id: "n1", value: 121 })];
    expect(findDuplicateRecords(incoming, existing)).toEqual([]);
  });

  it("handles empty inputs", () => {
    expect(findDuplicateRecords([], [])).toEqual([]);
    expect(findDuplicateRecords([record()], [])).toEqual([]);
    expect(findDuplicateRecords([], [record()])).toEqual([]);
  });

  it("only flags the matching subset in partial-duplicate batches", () => {
    const existing = [record()];
    const incoming = [record({ id: "dup" }), record({ id: "fresh", indicatorType: "bmi", value: 22.5 })];
    const duplicates = findDuplicateRecords(incoming, existing);
    expect(duplicates.map(r => r.id)).toEqual(["dup"]);
  });
});
