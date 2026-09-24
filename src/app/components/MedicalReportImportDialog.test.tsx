import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MedicalReportImportDialog } from "@/app/components/MedicalReportImportDialog";
import * as medicalReport from "@/app/services/medicalReport";

vi.mock("@/app/services/medicalReport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/services/medicalReport")>();
  return {
    // 暴露真实实现供个别测试委托（避免 vi.importActual 与 mock 的兼容问题）
    __actualModule: actual,
    ...actual,
    parseMedicalReport: vi.fn(),
    checkParserService: vi.fn(),
    extractIndicatorsFromTables: vi.fn(),
    resolveIndicators: vi.fn(),
    groupByAction: vi.fn(),
    getCategoriesToCreate: vi.fn(),
    clusterUnnamedIndicators: vi.fn(() => []),
    matchUnnamedLabels: vi.fn().mockResolvedValue(null),
  };
});

const getActualModule = () =>
  (medicalReport as unknown as { __actualModule: typeof medicalReport }).__actualModule;

const mockParseResult = {
  success: true,
  pageCount: 1,
  reportDate: "2024-01-15",
  tables: [{ pageIndex: 0, cells: [] }],
  indicators: [
    { rawLabel: "收缩压", value: 120, unit: "mmHg", referenceRange: "90-140", pageIndex: 0 },
    { rawLabel: "血糖", value: 5.2, unit: "mmol/L", referenceRange: "3.9-6.1", pageIndex: 0 },
  ],
  markdown: "",
};

const mockMatched = [
  { rawLabel: "收缩压", value: 120, unit: "mmHg", referenceRange: "90-140", pageIndex: 0, systemId: "blood_pressure_systolic", userItemId: "blood_pressure_systolic", matchType: "exact" as const, confidence: { level: "high" as const, score: 1.0, reasons: [] }, action: "import" as const, userItemFound: true },
  { rawLabel: "血糖", value: 5.2, unit: "mmol/L", referenceRange: "3.9-6.1", pageIndex: 0, systemId: "blood_glucose", userItemId: "blood_glucose", matchType: "exact" as const, confidence: { level: "high" as const, score: 1.0, reasons: [] }, action: "import" as const, userItemFound: true },
];

const mockGrouped = {
  import: mockMatched,
  createCategory: [],
  createItem: [],
  unnamed: [],
};

const mockImportRecords = vi.fn();

/** 打开对话框并完成一次文件解析，进入预览 tab */
const openAndParseReport = async () => {
  fireEvent.click(screen.getByText("报告导入"));
  const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], writable: false });
  fireEvent.change(input);
  await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
  fireEvent.click(screen.getByText("开始解析"));
};

describe("MedicalReportImportDialog E2E", () => {
  beforeEach(() => {
    vi.mocked(medicalReport.checkParserService).mockResolvedValue({
      online: true,
      endpoint: "http://127.0.0.1:8000",
      tried: ["http://127.0.0.1:8000"],
    });
    vi.mocked(medicalReport.parseMedicalReport).mockResolvedValue(mockParseResult);
    vi.mocked(medicalReport.extractIndicatorsFromTables).mockReturnValue(mockParseResult.indicators);
    vi.mocked(medicalReport.resolveIndicators).mockReturnValue(mockMatched);
    vi.mocked(medicalReport.groupByAction).mockReturnValue(mockGrouped);
    vi.mocked(medicalReport.getCategoriesToCreate).mockReturnValue([]);
    mockImportRecords.mockClear();
  });

  afterEach(() => { vi.clearAllMocks(); });

  it("渲染导入按钮", () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    expect(screen.getByText("报告导入")).toBeInTheDocument();
  });

  it("点击按钮打开对话框", () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));
    expect(screen.getByText("上传文件")).toBeInTheDocument();
    expect(screen.getByText("预览确认")).toBeInTheDocument();
  });

  it("选择有效文件后不显示错误", async () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));
    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);
    await waitFor(() => expect(screen.getByText("report.pdf")).toBeInTheDocument());
    expect(screen.queryByText("仅支持")).not.toBeInTheDocument();
  });

  it("拒绝不支持的文件类型", () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));
    const file = new File(["dummy"], "report.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);
    expect(screen.getByText("仅支持 PDF、JPG、PNG 格式")).toBeInTheDocument();
  });

  it("拒绝超大文件", () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));
    const file = new File(["x".repeat(51 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);
    expect(screen.getByText("文件不能超过 50MB")).toBeInTheDocument();
  });

  it("解析完成后显示指标数据", async () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    // 等待解析按钮出现并点击
    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    // 等待解析完成显示数据
    await waitFor(() => expect(screen.getByText("收缩压")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText("血糖")).toBeInTheDocument();
  });

  it("确认导入后调用 onImportRecords", async () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    await waitFor(() => expect(screen.getByText(/确认导入/)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByText(/确认导入/));

    expect(mockImportRecords).toHaveBeenCalledTimes(1);
    const records = mockImportRecords.mock.calls[0][0];
    expect(records).toHaveLength(2);
    expect(records[0].indicatorType).toBe("blood_pressure_systolic");
    expect(records[0].value).toBe(120);
  });

  it("解析失败时显示错误", async () => {
    vi.mocked(medicalReport.parseMedicalReport).mockRejectedValue(new Error("网络错误"));
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    await waitFor(() => expect(screen.getByText("网络错误")).toBeInTheDocument(), { timeout: 5000 });
  });

  it("关闭对话框后重新打开回到初始状态", async () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    fireEvent.click(screen.getByText("取消"));
    fireEvent.click(screen.getByText("报告导入"));
    expect(screen.getByText("上传文件")).toBeInTheDocument();
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
  });

  it("附件保存失败时提示未保存且记录不带 attachmentId", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const onAddAttachment = vi.fn(() => false);
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} onAddAttachment={onAddAttachment} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    await waitFor(() => expect(screen.getByText(/确认导入/)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByText(/确认导入/));

    await waitFor(() => expect(mockImportRecords).toHaveBeenCalledTimes(1));
    const records = mockImportRecords.mock.calls[0][0];
    expect(records).toHaveLength(2);
    records.forEach((r: { attachmentId?: string }) => {
      expect(r.attachmentId).toBeUndefined();
    });
    expect(onAddAttachment).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("附件未保存"));
    alertSpy.mockRestore();
  });

  it("附件保存成功时记录带 attachmentId", async () => {
    const onAddAttachment = vi.fn(() => true);
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} onAddAttachment={onAddAttachment} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    await waitFor(() => expect(screen.getByText(/确认导入/)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByText(/确认导入/));

    await waitFor(() => expect(mockImportRecords).toHaveBeenCalledTimes(1));
    const records = mockImportRecords.mock.calls[0][0];
    expect(records).toHaveLength(2);
    records.forEach((r: { attachmentId?: string }) => {
      expect(r.attachmentId).toBeDefined();
    });
    expect(onAddAttachment).toHaveBeenCalledTimes(1);
  });

  it("保留附件但文件超过附件上限时警告并可继续导入（不含附件）", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onAddAttachment = vi.fn(() => true);
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} onAddAttachment={onAddAttachment} />);
    fireEvent.click(screen.getByText("报告导入"));

    // 11MB 文件：解析上限（50MB）内、附件上限（10MB）外
    const file = new File(["x".repeat(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    await waitFor(() => expect(screen.getByText(/确认导入/)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByText(/确认导入/));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("附件大小上限"));
    await waitFor(() => expect(mockImportRecords).toHaveBeenCalledTimes(1));
    const records = mockImportRecords.mock.calls[0][0];
    records.forEach((r: { attachmentId?: string }) => {
      expect(r.attachmentId).toBeUndefined();
    });
    // 超限路径不应尝试保存附件
    expect(onAddAttachment).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("命中已有记录的行标记疑似重复且默认不导入", async () => {
    const existingRecords = [
      { id: "r1", date: "2024-01-15", indicatorType: "blood_pressure_systolic", value: 120, unit: "mmHg" },
    ];
    render(
      <MedicalReportImportDialog
        onImportRecords={mockImportRecords}
        existingRecords={existingRecords}
      />,
    );
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    await waitFor(() => expect(screen.getByText(/确认导入/)).toBeInTheDocument(), { timeout: 5000 });
    // 收缩压与已有记录重复 → 标记"疑似重复"徽标与"仍导入"勾选；血糖不重复
    expect(screen.getAllByText("疑似重复").length).toBeGreaterThan(0);
    expect(screen.getByText("仍导入")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/确认导入/));

    await waitFor(() => expect(mockImportRecords).toHaveBeenCalledTimes(1));
    const records = mockImportRecords.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].indicatorType).toBe("blood_glucose");
  });

  it("关闭对话框时取消在途解析请求", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(medicalReport.parseMedicalReport).mockImplementation(((_file: File, options?: { signal?: AbortSignal }) => {
      capturedSignal = options?.signal;
      return new Promise(() => {}); // 模拟在途请求
    }) as unknown as typeof medicalReport.parseMedicalReport);

    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));
    await waitFor(() => expect(capturedSignal).toBeDefined(), { timeout: 3000 });

    // preview tab 下通过右上角 X 关闭对话框 → abort 在途请求
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("关闭对话框时取消在途二次匹配请求", async () => {
    const actual = getActualModule();
    vi.mocked(medicalReport.parseMedicalReport).mockResolvedValue({
      ...mockParseResult,
      indicators: [
        { rawLabel: "未知指标Q", value: 1.2, unit: "", referenceRange: "", pageIndex: 0 },
      ],
    });
    vi.mocked(medicalReport.resolveIndicators).mockImplementation(actual.resolveIndicators);
    vi.mocked(medicalReport.clusterUnnamedIndicators).mockImplementation(actual.clusterUnnamedIndicators);
    vi.mocked(medicalReport.groupByAction).mockImplementation(actual.groupByAction);
    let matchSignal: AbortSignal | undefined;
    vi.mocked(medicalReport.matchUnnamedLabels).mockImplementation(((
      _labels: string[],
      _catalog: { id: string; label: string }[],
      options?: { signal?: AbortSignal },
    ) => {
      matchSignal = options?.signal;
      return new Promise(() => {}); // 模拟在途匹配
    }) as unknown as typeof medicalReport.matchUnnamedLabels);

    try {
      render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
      fireEvent.click(screen.getByText("报告导入"));

      const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, "files", { value: [file], writable: false });
      fireEvent.change(input);

      await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
      fireEvent.click(screen.getByText("开始解析"));
      await waitFor(() => expect(matchSignal).toBeDefined(), { timeout: 5000 });

      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(matchSignal?.aborted).toBe(true);
    } finally {
      vi.mocked(medicalReport.resolveIndicators).mockReturnValue(mockMatched);
      vi.mocked(medicalReport.clusterUnnamedIndicators).mockReturnValue([]);
      vi.mocked(medicalReport.groupByAction).mockReturnValue(mockGrouped);
      vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue(null);
    }
  });

  it("未命名指标改名为用户库已有指标后转为可导入", async () => {
    const actual = getActualModule();
    vi.mocked(medicalReport.parseMedicalReport).mockResolvedValue({
      ...mockParseResult,
      indicators: [
        { rawLabel: "血清半胱氨酸蛋白酶抑制剂X", value: 0.9, unit: "mg/L", referenceRange: "0.51-1.09", pageIndex: 0 },
      ],
    });
    vi.mocked(medicalReport.resolveIndicators).mockImplementation(actual.resolveIndicators);
    vi.mocked(medicalReport.clusterUnnamedIndicators).mockImplementation(actual.clusterUnnamedIndicators);
    vi.mocked(medicalReport.groupByAction).mockImplementation(actual.groupByAction);
    vi.mocked(medicalReport.getCategoriesToCreate).mockImplementation(actual.getCategoriesToCreate);

    const userCategories = [
      {
        id: "cat_kidney",
        name: "肾功能",
        code: "",
        items: [
          { id: "kidney_item_1", label: "胱抑素C", unit: "mg/L", code: "", referenceRange: "0.51-1.09", aliases: [] },
        ],
      },
    ];

    try {
      render(
        <MedicalReportImportDialog
          onImportRecords={mockImportRecords}
          existingCategories={userCategories as unknown as Parameters<typeof MedicalReportImportDialog>[0]["existingCategories"]}
        />,
      );
      fireEvent.click(screen.getByText("报告导入"));

      const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, "files", { value: [file], writable: false });
      fireEvent.change(input);

      await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
      fireEvent.click(screen.getByText("开始解析"));

      // 未命名区域出现重命名输入框（此时不可导入）
      const renameInput = await waitFor(() => {
        const el = screen.getByRole("textbox");
        expect(el).toBeInTheDocument();
        return el;
      }, { timeout: 5000 });
      expect((screen.getByText(/确认导入/) as HTMLButtonElement).disabled).toBe(true);

      // 改名为用户库已有指标并提交（blur）
      fireEvent.change(renameInput, { target: { value: "胱抑素C" } });
      fireEvent.blur(renameInput);

      // 整表重跑匹配后，该条目命中用户指标库 → 可导入
      await waitFor(() =>
        expect((screen.getByText(/确认导入 \(1 条\)/) as HTMLButtonElement).disabled).toBe(false),
        { timeout: 5000 },
      );
      fireEvent.click(screen.getByText(/确认导入/));

      await waitFor(() => expect(mockImportRecords).toHaveBeenCalledTimes(1));
      const records = mockImportRecords.mock.calls[0][0];
      expect(records).toHaveLength(1);
      expect(records[0].indicatorType).toBe("kidney_item_1");
      expect(records[0].value).toBe(0.9);
    } finally {
      vi.mocked(medicalReport.resolveIndicators).mockReturnValue(mockMatched);
      vi.mocked(medicalReport.clusterUnnamedIndicators).mockReturnValue([]);
      vi.mocked(medicalReport.groupByAction).mockReturnValue(mockGrouped);
      vi.mocked(medicalReport.getCategoriesToCreate).mockReturnValue([]);
    }
  });

  it("未命名指标按报告分组、AI 建议、未分组三档展示", async () => {
    const actual = getActualModule();
    vi.mocked(medicalReport.parseMedicalReport).mockResolvedValue({
      ...mockParseResult,
      indicators: [
        { rawLabel: "鸟嘌呤脱氨酶", value: 3, unit: "U/L", referenceRange: "", pageIndex: 0, reportCategory: "肝功能" },
        { rawLabel: "甘胆酸", value: 2.1, unit: "mg/L", referenceRange: "", pageIndex: 0, reportCategory: "肝功能" },
        { rawLabel: "未知糖链抗原Z", value: 15, unit: "U/mL", referenceRange: "", pageIndex: 0 },
        { rawLabel: "神秘因子Q", value: 0.5, unit: "g/L", referenceRange: "", pageIndex: 0 },
      ],
    });
    vi.mocked(medicalReport.resolveIndicators).mockImplementation(actual.resolveIndicators);
    vi.mocked(medicalReport.clusterUnnamedIndicators).mockImplementation(actual.clusterUnnamedIndicators);
    vi.mocked(medicalReport.groupByAction).mockImplementation(actual.groupByAction);
    vi.mocked(medicalReport.getCategoriesToCreate).mockImplementation(actual.getCategoriesToCreate);
    vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue([
      { label: "鸟嘌呤脱氨酶", catalogId: null, catalogLabel: null, suggestedCategory: "肝功能" },
      { label: "甘胆酸", catalogId: null, catalogLabel: null, suggestedCategory: "肝功能" },
      { label: "未知糖链抗原Z", catalogId: null, catalogLabel: null, suggestedCategory: "肿瘤标志物" },
      { label: "神秘因子Q", catalogId: null, catalogLabel: null, suggestedCategory: null },
    ]);

    try {
      render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
      await openAndParseReport();

      // 报告分组「肝功能」与「报告分组」徽标
      await waitFor(() => expect(screen.getByText("肝功能")).toBeInTheDocument(), { timeout: 5000 });
      expect(screen.getByText("报告分组")).toBeInTheDocument();
      expect(screen.getByDisplayValue("鸟嘌呤脱氨酶")).toBeInTheDocument();
      expect(screen.getByDisplayValue("甘胆酸")).toBeInTheDocument();

      // AI 建议分组（二次匹配异步返回后出现）
      await waitFor(() => expect(screen.getByText("肿瘤标志物")).toBeInTheDocument(), { timeout: 5000 });
      expect(screen.getByText("AI 建议")).toBeInTheDocument();

      // 未分组：组名 + 徽标各出现一次
      expect(screen.getAllByText("未分组").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByDisplayValue("神秘因子Q")).toBeInTheDocument();
    } finally {
      vi.mocked(medicalReport.resolveIndicators).mockReturnValue(mockMatched);
      vi.mocked(medicalReport.clusterUnnamedIndicators).mockReturnValue([]);
      vi.mocked(medicalReport.groupByAction).mockReturnValue(mockGrouped);
      vi.mocked(medicalReport.getCategoriesToCreate).mockReturnValue([]);
      vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue(null);
    }
  });

  it("整组新增为分类：确认后建库并导入整组记录，组内条目从未命名区消失", async () => {
    const actual = getActualModule();
    vi.mocked(medicalReport.parseMedicalReport).mockResolvedValue({
      ...mockParseResult,
      indicators: [
        { rawLabel: "鸟嘌呤脱氨酶", value: 3, unit: "U/L", referenceRange: "", pageIndex: 0, reportCategory: "肝功能" },
        { rawLabel: "甘胆酸", value: 2.1, unit: "mg/L", referenceRange: "", pageIndex: 0, reportCategory: "肝功能" },
        { rawLabel: "神秘因子Q", value: 0.5, unit: "g/L", referenceRange: "", pageIndex: 0 },
      ],
    });
    vi.mocked(medicalReport.resolveIndicators).mockImplementation(actual.resolveIndicators);
    vi.mocked(medicalReport.clusterUnnamedIndicators).mockImplementation(actual.clusterUnnamedIndicators);
    vi.mocked(medicalReport.groupByAction).mockImplementation(actual.groupByAction);
    vi.mocked(medicalReport.getCategoriesToCreate).mockImplementation(actual.getCategoriesToCreate);
    vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue(null);

    const onEnsureCategoryItems = vi.fn().mockReturnValue({
      "鸟嘌呤脱氨酶": "new_item_1",
      "甘胆酸": "new_item_2",
    });

    try {
      render(
        <MedicalReportImportDialog
          onImportRecords={mockImportRecords}
          onEnsureCategoryItems={onEnsureCategoryItems}
        />,
      );
      await openAndParseReport();

      await waitFor(() => expect(screen.getByText("肝功能")).toBeInTheDocument(), { timeout: 5000 });
      // 具名组与未分组均提供整组导入入口；具名组排在前，取第一个即「肝功能」组
      expect(screen.getAllByRole("button", { name: "整组新增为分类" })).toHaveLength(2);
      fireEvent.click(screen.getAllByRole("button", { name: "整组新增为分类" })[0]);

      // 组头出现可编辑组名输入框（默认组名）
      expect(screen.getByDisplayValue("肝功能")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "确认导入" }));

      // 建库回调：组名 + 每簇一项（canonicalLabel + 首条 unit）
      await waitFor(() => expect(onEnsureCategoryItems).toHaveBeenCalledTimes(1));
      expect(onEnsureCategoryItems).toHaveBeenCalledWith("肝功能", [
        { label: "鸟嘌呤脱氨酶", unit: "U/L" },
        { label: "甘胆酸", unit: "mg/L" },
      ]);

      // 每条指标记录各自导入，indicatorType 为映射后的 id
      await waitFor(() => expect(mockImportRecords).toHaveBeenCalledTimes(1));
      const records = mockImportRecords.mock.calls[0][0];
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({ indicatorType: "new_item_1", value: 3, unit: "U/L", date: "2024-01-15" });
      expect(records[1]).toMatchObject({ indicatorType: "new_item_2", value: 2.1, unit: "mg/L", date: "2024-01-15" });

      // 组内条目从未命名区消失，其余未分组指标保留
      await waitFor(() => expect(screen.queryByText("肝功能")).not.toBeInTheDocument());
      expect(screen.queryByDisplayValue("鸟嘌呤脱氨酶")).not.toBeInTheDocument();
      expect(screen.getByDisplayValue("神秘因子Q")).toBeInTheDocument();
    } finally {
      vi.mocked(medicalReport.resolveIndicators).mockReturnValue(mockMatched);
      vi.mocked(medicalReport.clusterUnnamedIndicators).mockReturnValue([]);
      vi.mocked(medicalReport.groupByAction).mockReturnValue(mockGrouped);
      vi.mocked(medicalReport.getCategoriesToCreate).mockReturnValue([]);
      vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue(null);
    }
  });

  it("整组导入前可编辑组名，确认后使用编辑后的组名建库", async () => {
    const actual = getActualModule();
    vi.mocked(medicalReport.parseMedicalReport).mockResolvedValue({
      ...mockParseResult,
      indicators: [
        { rawLabel: "鸟嘌呤脱氨酶", value: 3, unit: "U/L", referenceRange: "", pageIndex: 0, reportCategory: "肝功能" },
        { rawLabel: "甘胆酸", value: 2.1, unit: "mg/L", referenceRange: "", pageIndex: 0, reportCategory: "肝功能" },
      ],
    });
    vi.mocked(medicalReport.resolveIndicators).mockImplementation(actual.resolveIndicators);
    vi.mocked(medicalReport.clusterUnnamedIndicators).mockImplementation(actual.clusterUnnamedIndicators);
    vi.mocked(medicalReport.groupByAction).mockImplementation(actual.groupByAction);
    vi.mocked(medicalReport.getCategoriesToCreate).mockImplementation(actual.getCategoriesToCreate);
    vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue(null);

    const onEnsureCategoryItems = vi.fn().mockReturnValue({
      "鸟嘌呤脱氨酶": "new_item_1",
      "甘胆酸": "new_item_2",
    });

    try {
      render(
        <MedicalReportImportDialog
          onImportRecords={mockImportRecords}
          onEnsureCategoryItems={onEnsureCategoryItems}
        />,
      );
      await openAndParseReport();

      await waitFor(() => expect(screen.getByText("肝功能")).toBeInTheDocument(), { timeout: 5000 });
      fireEvent.click(screen.getByRole("button", { name: "整组新增为分类" }));

      // 组名输入框可编辑，改名后确认
      const nameInput = screen.getByDisplayValue("肝功能");
      fireEvent.change(nameInput, { target: { value: "肝功能全套" } });
      fireEvent.click(screen.getByRole("button", { name: "确认导入" }));

      await waitFor(() => expect(onEnsureCategoryItems).toHaveBeenCalledTimes(1));
      expect(onEnsureCategoryItems).toHaveBeenCalledWith("肝功能全套", [
        { label: "鸟嘌呤脱氨酶", unit: "U/L" },
        { label: "甘胆酸", unit: "mg/L" },
      ]);
    } finally {
      vi.mocked(medicalReport.resolveIndicators).mockReturnValue(mockMatched);
      vi.mocked(medicalReport.clusterUnnamedIndicators).mockReturnValue([]);
      vi.mocked(medicalReport.groupByAction).mockReturnValue(mockGrouped);
      vi.mocked(medicalReport.getCategoriesToCreate).mockReturnValue([]);
      vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue(null);
    }
  });

  it("AI 分类建议全 null 时，未分组区域显示降级提示", async () => {
    const actual = getActualModule();
    vi.mocked(medicalReport.parseMedicalReport).mockResolvedValue({
      ...mockParseResult,
      indicators: [
        { rawLabel: "神秘因子Q", value: 0.5, unit: "g/L", referenceRange: "", pageIndex: 0 },
      ],
    });
    vi.mocked(medicalReport.resolveIndicators).mockImplementation(actual.resolveIndicators);
    vi.mocked(medicalReport.clusterUnnamedIndicators).mockImplementation(actual.clusterUnnamedIndicators);
    vi.mocked(medicalReport.groupByAction).mockImplementation(actual.groupByAction);
    vi.mocked(medicalReport.getCategoriesToCreate).mockImplementation(actual.getCategoriesToCreate);
    vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue([
      { label: "神秘因子Q", catalogId: null, catalogLabel: null, suggestedCategory: null },
    ]);

    try {
      render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
      await openAndParseReport();

      await waitFor(
        () =>
          expect(
            screen.getByText("AI 分类建议未返回（解析服务可能未更新或模型无法判断），可逐簇命名，或整组新增为分类。"),
          ).toBeInTheDocument(),
        { timeout: 5000 },
      );
    } finally {
      vi.mocked(medicalReport.resolveIndicators).mockReturnValue(mockMatched);
      vi.mocked(medicalReport.clusterUnnamedIndicators).mockReturnValue([]);
      vi.mocked(medicalReport.groupByAction).mockReturnValue(mockGrouped);
      vi.mocked(medicalReport.getCategoriesToCreate).mockReturnValue([]);
      vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue(null);
    }
  });

  it("未分组整组导入：默认组名为空且确认禁用，填入名称后建库并导入", async () => {
    const actual = getActualModule();
    vi.mocked(medicalReport.parseMedicalReport).mockResolvedValue({
      ...mockParseResult,
      indicators: [
        { rawLabel: "神秘因子Q", value: 0.5, unit: "g/L", referenceRange: "", pageIndex: 0 },
      ],
    });
    vi.mocked(medicalReport.resolveIndicators).mockImplementation(actual.resolveIndicators);
    vi.mocked(medicalReport.clusterUnnamedIndicators).mockImplementation(actual.clusterUnnamedIndicators);
    vi.mocked(medicalReport.groupByAction).mockImplementation(actual.groupByAction);
    vi.mocked(medicalReport.getCategoriesToCreate).mockImplementation(actual.getCategoriesToCreate);
    vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue(null);

    const onEnsureCategoryItems = vi.fn().mockReturnValue({
      "神秘因子Q": "new_item_ungrouped",
    });

    try {
      render(
        <MedicalReportImportDialog
          onImportRecords={mockImportRecords}
          onEnsureCategoryItems={onEnsureCategoryItems}
        />,
      );
      await openAndParseReport();

      // 未分组组头出现「整组新增为分类」按钮（仅此一组）
      const importGroupButton = await waitFor(() => {
        const btn = screen.getByRole("button", { name: "整组新增为分类" });
        expect(btn).toBeInTheDocument();
        return btn;
      }, { timeout: 5000 });
      fireEvent.click(importGroupButton);

      // 组名输入默认为空，确认按钮禁用（组名输入位于簇重命名输入之前）
      const nameInput = screen.getAllByRole("textbox")[0] as HTMLInputElement;
      expect(nameInput.value).toBe("");
      expect((screen.getByRole("button", { name: "确认导入" }) as HTMLButtonElement).disabled).toBe(true);

      // 填入名称后确认 → 以新组名建库
      fireEvent.change(nameInput, { target: { value: "自定义分类" } });
      fireEvent.click(screen.getByRole("button", { name: "确认导入" }));

      await waitFor(() => expect(onEnsureCategoryItems).toHaveBeenCalledTimes(1));
      expect(onEnsureCategoryItems).toHaveBeenCalledWith("自定义分类", [
        { label: "神秘因子Q", unit: "g/L" },
      ]);

      // 组内记录导入，indicatorType 为映射后的 id
      await waitFor(() => expect(mockImportRecords).toHaveBeenCalledTimes(1));
      const records = mockImportRecords.mock.calls[0][0];
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ indicatorType: "new_item_ungrouped", value: 0.5, unit: "g/L", date: "2024-01-15" });
    } finally {
      vi.mocked(medicalReport.resolveIndicators).mockReturnValue(mockMatched);
      vi.mocked(medicalReport.clusterUnnamedIndicators).mockReturnValue([]);
      vi.mocked(medicalReport.groupByAction).mockReturnValue(mockGrouped);
      vi.mocked(medicalReport.getCategoriesToCreate).mockReturnValue([]);
      vi.mocked(medicalReport.matchUnnamedLabels).mockResolvedValue(null);
    }
  });
});
