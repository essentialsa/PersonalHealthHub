import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportRecordsDialog } from "@/app/components/ImportRecordsDialog";
import type { HealthRecord } from "@/app/components/AddRecordDialog";
import * as XLSX from "xlsx";

vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: { sheet_to_json: vi.fn() },
}));

const categories = [
  {
    id: "cat-lipid",
    name: "血脂",
    code: "",
    items: [{ id: "tc", label: "总胆固醇", unit: "mmol/L", referenceRange: "<5.2" }],
  },
];

const mockImportRecords = vi.fn();

const uploadSheet = () => {
  const file = new File(["dummy"], "data.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], writable: false });
  fireEvent.change(input);
};

describe("ImportRecordsDialog 导入去重", () => {
  beforeEach(() => {
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: { Sheet1: {} },
    } as unknown as XLSX.WorkBook);
    mockImportRecords.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("命中已有记录的行标记疑似重复且默认不导入，勾选后可强制导入", async () => {
    const existingRecords: HealthRecord[] = [
      { id: "r1", date: "2026-08-30", indicatorType: "tc", value: 5.2, unit: "mmol/L" },
    ];
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      ["数据日期", "检验项目", "数值"],
      ["2026-08-30", "总胆固醇", 5.2], // 与已有记录重复
      ["2026-08-31", "总胆固醇", 5.6], // 非重复
    ] as unknown as ReturnType<typeof XLSX.utils.sheet_to_json>);

    render(
      <ImportRecordsDialog
        categories={categories}
        onImportRecords={mockImportRecords}
        existingRecords={existingRecords}
      />,
    );
    fireEvent.click(screen.getByText("Excel 导入"));
    uploadSheet();

    await waitFor(() => expect(screen.getByText(/解析完成：共 2 行/)).toBeInTheDocument());
    expect(screen.getByText("疑似重复")).toBeInTheDocument();

    // 默认勾选状态：可导入 1 条（非重复行），导入按钮可用
    const importButton = screen.getByRole("button", { name: /确认导入有效数据/ });
    expect(importButton).toBeInTheDocument();

    fireEvent.click(importButton);
    await waitFor(() => expect(mockImportRecords).toHaveBeenCalledTimes(1));
    const records = mockImportRecords.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].date).toBe("2026-08-31");
    expect(records[0].value).toBe(5.6);
  });

  it("勾选仍导入后重复行进入导入", async () => {
    const existingRecords: HealthRecord[] = [
      { id: "r1", date: "2026-08-30", indicatorType: "tc", value: 5.2, unit: "mmol/L" },
    ];
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      ["数据日期", "检验项目", "数值"],
      ["2026-08-30", "总胆固醇", 5.2],
    ] as unknown as ReturnType<typeof XLSX.utils.sheet_to_json>);

    render(
      <ImportRecordsDialog
        categories={categories}
        onImportRecords={mockImportRecords}
        existingRecords={existingRecords}
      />,
    );
    fireEvent.click(screen.getByText("Excel 导入"));
    uploadSheet();

    await waitFor(() => expect(screen.getByText("疑似重复")).toBeInTheDocument());

    // 唯一行是重复行：未勾选时按钮禁用
    const importButton = screen.getByRole("button", { name: /确认导入有效数据/ });
    expect((importButton as HTMLButtonElement).disabled).toBe(true);

    // 勾选"仍导入"（Radix Checkbox 渲染 button + 隐藏 input 两个 checkbox role，点击可见按钮）
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    await waitFor(() => expect((importButton as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(importButton);
    await waitFor(() => expect(mockImportRecords).toHaveBeenCalledTimes(1));
    const records = mockImportRecords.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].date).toBe("2026-08-30");
  });

  it("无已有记录时不标记重复", async () => {
    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([
      ["数据日期", "检验项目", "数值"],
      ["2026-08-30", "总胆固醇", 5.2],
    ] as unknown as ReturnType<typeof XLSX.utils.sheet_to_json>);

    render(
      <ImportRecordsDialog
        categories={categories}
        onImportRecords={mockImportRecords}
        existingRecords={[]}
      />,
    );
    fireEvent.click(screen.getByText("Excel 导入"));
    uploadSheet();

    await waitFor(() => expect(screen.getByText("可导入")).toBeInTheDocument());
    expect(screen.queryByText("疑似重复")).not.toBeInTheDocument();
  });
});
