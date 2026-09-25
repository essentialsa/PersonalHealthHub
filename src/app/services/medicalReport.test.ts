import { describe, it, expect, vi, afterEach } from "vitest";
import {
  matchIndicator,
  calcConfidence,
  matchAllIndicators,
  extractIndicatorsFromTables,
  extractDate,
  resolveIndicators,
  groupByAction,
  clusterUnnamedIndicators,
  groupUnnamedClusters,
  type ResolvedIndicator,
  type ParsedTable,
  type ExtractedIndicator,
} from "@/app/services/medicalReport";

describe("matchIndicator", () => {
  it("精确匹配标准中文名", () => {
    const r = matchIndicator("收缩压");
    expect(r.matchType).toBe("exact");
    expect(r.systemId).toBe("blood_pressure_systolic");
  });

  it("精确匹配英文缩写", () => {
    const r = matchIndicator("ALT");
    expect(r.matchType).toBe("exact");
    expect(r.systemId).toBe("alt");
  });

  it("模糊匹配别名", () => {
    const r = matchIndicator("低密度脂蛋白");
    expect(r.matchType).toBe("exact");
    expect(r.systemId).toBe("ldl_cholesterol");
  });

  it("未匹配返回 none", () => {
    const r = matchIndicator("完全不存在的指标名XYZ");
    expect(r.matchType).toBe("none");
    expect(r.systemId).toBeUndefined();
  });

  it("忽略前后空格", () => {
    const r = matchIndicator("  血糖  ");
    expect(r.matchType).toBe("exact");
  });
});

describe("calcConfidence", () => {
  it("精确匹配返回 high", () => {
    const c = calcConfidence({ matchType: "exact" }, 120);
    expect(c.level).toBe("high");
    expect(c.score).toBe(1.0);
  });

  it("模糊匹配根据相似度评分", () => {
    const c = calcConfidence({ matchType: "fuzzy", similarity: 0.9 }, 5.2);
    expect(c.level).toBe("high");
    expect(c.score).toBe(0.9);
  });

  it("未匹配返回 low", () => {
    const c = calcConfidence({ matchType: "none" }, 0);
    expect(c.level).toBe("low");
    expect(c.score).toBe(0);
  });

  it("负数值降级", () => {
    const c = calcConfidence({ matchType: "exact" }, -1);
    expect(c.score).toBeLessThan(1.0);
  });
});

describe("matchAllIndicators", () => {
  const indicators: ExtractedIndicator[] = [
    { rawLabel: "收缩压", value: 120, unit: "mmHg", pageIndex: 0 },
    { rawLabel: "血糖", value: 5.2, unit: "mmol/L", pageIndex: 0 },
    { rawLabel: "未知指标", value: 10, unit: "U/L", pageIndex: 0 },
  ];

  it("批量匹配返回正确数量", () => {
    const result = matchAllIndicators(indicators);
    expect(result).toHaveLength(3);
  });

  it("已匹配的有 systemId", () => {
    const result = matchAllIndicators(indicators);
    expect(result[0].systemId).toBe("blood_pressure_systolic");
    expect(result[1].systemId).toBe("blood_glucose");
  });

  it("未匹配的 matchType 为 none", () => {
    const result = matchAllIndicators(indicators);
    expect(result[2].matchType).toBe("none");
  });
});

describe("extractIndicatorsFromTables", () => {
  const mockTable: ParsedTable = {
    pageIndex: 0,
    cells: [
      { row: 0, col: 0, text: "检验项目", bbox: [0, 0, 0, 0] },
      { row: 0, col: 1, text: "结果", bbox: [0, 0, 0, 0] },
      { row: 0, col: 2, text: "单位", bbox: [0, 0, 0, 0] },
      { row: 0, col: 3, text: "参考范围", bbox: [0, 0, 0, 0] },
      { row: 1, col: 0, text: "收缩压", bbox: [0, 0, 0, 0] },
      { row: 1, col: 1, text: "120", bbox: [0, 0, 0, 0] },
      { row: 1, col: 2, text: "mmHg", bbox: [0, 0, 0, 0] },
      { row: 1, col: 3, text: "90-140", bbox: [0, 0, 0, 0] },
      { row: 2, col: 0, text: "血糖", bbox: [0, 0, 0, 0] },
      { row: 2, col: 1, text: "5.2", bbox: [0, 0, 0, 0] },
      { row: 2, col: 2, text: "mmol/L", bbox: [0, 0, 0, 0] },
      { row: 2, col: 3, text: "3.9-6.1", bbox: [0, 0, 0, 0] },
    ],
  };

  it("从表格提取指标", () => {
    const result = extractIndicatorsFromTables([mockTable]);
    expect(result).toHaveLength(2);
    expect(result[0].rawLabel).toBe("收缩压");
    expect(result[0].value).toBe(120);
    expect(result[0].unit).toBe("mmHg");
  });

  it("跳过非数值行", () => {
    const table: ParsedTable = {
      pageIndex: 0,
      cells: [
        { row: 0, col: 0, text: "项目", bbox: [0, 0, 0, 0] },
        { row: 0, col: 1, text: "结果", bbox: [0, 0, 0, 0] },
        { row: 1, col: 0, text: "异常", bbox: [0, 0, 0, 0] },
        { row: 1, col: 1, text: "不是数字", bbox: [0, 0, 0, 0] },
      ],
    };
    const result = extractIndicatorsFromTables([table]);
    expect(result).toHaveLength(0);
  });

  it("空表格返回空数组", () => {
    expect(extractIndicatorsFromTables([])).toEqual([]);
  });
});

describe("extractDate", () => {
  it("提取 YYYY-MM-DD", () => {
    expect(extractDate("体检日期：2024-01-15")).toBe("2024-01-15");
  });

  it("提取 YYYY/MM/DD", () => {
    expect(extractDate("日期 2024/3/5")).toBe("2024-03-05");
  });

  it("提取中文日期", () => {
    expect(extractDate("2024年12月25日体检")).toBe("2024-12-25");
  });

  it("无日期返回 null", () => {
    expect(extractDate("没有日期的文本")).toBeNull();
  });
});

describe("resolveIndicators", () => {
  it("用户已有指标时 action 为 import", () => {
    const userCats = [{ id: "cat1", name: "blood_lipids", items: [{ id: "item1", label: "甘油三酯" }] }];
    const extracted: ExtractedIndicator[] = [{ rawLabel: "甘油三酯", value: 0.68, unit: "mmol/L", pageIndex: 0 }];
    const result = resolveIndicators(extracted, userCats);
    expect(result[0].action).toBe("import");
    expect(result[0].userItemFound).toBe(true);
  });

  it("英文缩写优先匹配用户已维护的中文指标", () => {
    const userCats = [
      {
        id: "bloodSugar",
        name: "血糖",
        items: [{ id: "bloodSugar", label: "血糖", unit: "mmol/L" }],
      },
    ];
    const extracted: ExtractedIndicator[] = [{ rawLabel: "GLU", value: 6.4, unit: "mmol/L", pageIndex: 0 }];
    const result = resolveIndicators(extracted, userCats);
    expect(result[0].action).toBe("import");
    expect(result[0].systemId).toBe("bloodSugar");
  });

  it("用户维护别名时按别名导入", () => {
    const userCats = [
      {
        id: "bloodRoutine",
        name: "血常规",
        items: [{ id: "wbcUser", label: "白细胞", unit: "g/L", aliases: ["WBC", "白细胞计数"] }],
      },
    ];
    const extracted: ExtractedIndicator[] = [{ rawLabel: "WBC", value: 6.5, unit: "g/L", pageIndex: 0 }];
    const result = resolveIndicators(extracted, userCats);
    expect(result[0].action).toBe("import");
    expect(result[0].systemId).toBe("wbcUser");
    expect(result[0].userItemFound).toBe(true);
  });

  it("未匹配指标 action 为 unnamed", () => {
    const result = resolveIndicators([{ rawLabel: "未知指标", value: 10, unit: "U/L", pageIndex: 0 }], []);
    expect(result[0].action).toBe("unnamed");
  });

  it("匹配但用户无分类时 action 为 create_category", () => {
    const result = resolveIndicators([{ rawLabel: "总胆固醇", value: 5.35, unit: "mmol/L", pageIndex: 0 }], []);
    expect(result[0].action).toBe("create_category");
  });
});

describe("groupByAction", () => {
  it("按 action 正确分组", () => {
    const userCats = [{ id: "cat1", name: "blood_lipids", items: [{ id: "item1", label: "甘油三酯" }] }];
    const extracted: ExtractedIndicator[] = [
      { rawLabel: "甘油三酯", value: 0.68, unit: "mmol/L", pageIndex: 0 },
      { rawLabel: "未知指标", value: 10, unit: "U/L", pageIndex: 0 },
    ];
    const resolved = resolveIndicators(extracted, userCats);
    const grouped = groupByAction(resolved);
    expect(grouped.import).toHaveLength(1);
    expect(grouped.unnamed).toHaveLength(1);
  });
});


describe("clusterUnnamedIndicators（未命名指标聚类）", () => {
  const makeUnnamed = (rawLabel: string, value = 5): ResolvedIndicator[] =>
    rawLabel.split(",").map((label, i) => ({
      rawLabel: label,
      value: value + i,
      unit: "mmol/L",
      pageIndex: 0,
      matchType: "none" as const,
      confidence: { level: "low" as const, score: 0, reasons: [] },
      userItemFound: false,
      action: "unnamed" as const,
    }));

  it("归一化后相同名称聚为一簇（空格等格式差异）", () => {
    const clusters = clusterUnnamedIndicators(makeUnnamed("血糖,血糖 ,血糖"));
    expect(clusters).toHaveLength(1);
    expect(clusters[0].items).toHaveLength(3);
  });

  it("编辑距离相似度 ≥0.85 的写法变体并入同簇", () => {
    // 8 字 vs 9 字仅差一个"1"，相似度 8/9 ≈ 0.89
    const clusters = clusterUnnamedIndicators(makeUnnamed("乳酸脱氢酶同工酶,乳酸脱氢酶同工酶1"));
    expect(clusters).toHaveLength(1);
    expect(clusters[0].items).toHaveLength(2);
  });

  it("不同指标不误并（白细胞 vs 白细胞酯酶，相似度仅 0.6）", () => {
    const clusters = clusterUnnamedIndicators(makeUnnamed("白细胞,白细胞酯酶"));
    expect(clusters).toHaveLength(2);
  });

  it("簇内保留各自数值，canonicalLabel 取首条原始写法", () => {
    const clusters = clusterUnnamedIndicators(makeUnnamed("血清甘油三酯,血清甘油三酯"));
    expect(clusters).toHaveLength(1);
    expect(clusters[0].canonicalLabel).toBe("血清甘油三酯");
    const values = clusters[0].items.map(item => item.value).sort((a, b) => a - b);
    expect(values).toEqual([5, 6]);
  });

  it("空数组返回空簇；单条返回单簇", () => {
    expect(clusterUnnamedIndicators([])).toEqual([]);
    const single = clusterUnnamedIndicators(makeUnnamed("肌钙蛋白I"));
    expect(single).toHaveLength(1);
    expect(single[0].items).toHaveLength(1);
  });
});

describe("groupUnnamedClusters（未命名簇按类别分组）", () => {
  const makeIndicator = (rawLabel: string, reportCategory?: string): ResolvedIndicator => ({
    rawLabel,
    value: 1,
    unit: "mmol/L",
    pageIndex: 0,
    matchType: "none" as const,
    confidence: { level: "low" as const, score: 0, reasons: [] },
    userItemFound: false,
    action: "unnamed" as const,
    reportCategory,
  });

  it("报告分组优先：reportCategory 各成一 report 组，顺序按首簇出现顺序", () => {
    const clusters = clusterUnnamedIndicators([
      makeIndicator("血清前白蛋白", "肝功能"),
      makeIndicator("嗜碱性粒细胞计数", "血常规"),
    ]);
    const groups = groupUnnamedClusters(clusters, {});
    expect(groups.map(g => ({ name: g.name, source: g.source }))).toEqual([
      { name: "肝功能", source: "report" },
      { name: "血常规", source: "report" },
    ]);
    expect(groups[0].clusters).toHaveLength(1);
    expect(groups[1].clusters).toHaveLength(1);
  });

  it("无 reportCategory 时用 aiCategoryMap 兜底（source='ai'）", () => {
    const clusters = clusterUnnamedIndicators([makeIndicator("血清胱抑素C")]);
    const groups = groupUnnamedClusters(clusters, { [clusters[0].key]: "肾功能" });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("肾功能");
    expect(groups[0].source).toBe("ai");
    expect(groups[0].clusters).toHaveLength(1);
  });

  it("AI 建议分类名与报告分组名归一化相同时并入 report 组", () => {
    const clusters = clusterUnnamedIndicators([
      makeIndicator("血清前白蛋白", "肝功能"),
      makeIndicator("视黄醇结合蛋白"),
    ]);
    const groups = groupUnnamedClusters(clusters, { [clusters[1].key]: "肝 功 能" });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("肝功能");
    expect(groups[0].source).toBe("report");
    expect(groups[0].clusters).toHaveLength(2);
  });

  it("既无 reportCategory 又无 AI 建议的簇归入「未分组」且排在最后", () => {
    const clusters = clusterUnnamedIndicators([
      makeIndicator("血清前白蛋白", "肝功能"),
      makeIndicator("维生素B12"),
      makeIndicator("嗜碱性粒细胞计数", "血常规"),
    ]);
    const groups = groupUnnamedClusters(clusters, {});
    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({ name: "肝功能", source: "report" });
    expect(groups[1]).toMatchObject({ name: "血常规", source: "report" });
    expect(groups[2]).toMatchObject({ name: "未分组", source: "none" });
    expect(groups[2].clusters).toHaveLength(1);
  });

  it("簇内多条指标时取第一条非空 reportCategory", () => {
    const clusters = clusterUnnamedIndicators([
      makeIndicator("某项复合指标"),
      makeIndicator("某项复合指标", ""),
      makeIndicator("某项复合指标", "血脂"),
    ]);
    expect(clusters).toHaveLength(1);
    const groups = groupUnnamedClusters(clusters, {});
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "血脂", source: "report" });
    expect(groups[0].clusters).toHaveLength(1);
  });

  it("不同簇的 AI 建议归一化同名时合并为一组", () => {
    const clusters = clusterUnnamedIndicators([
      makeIndicator("缺铁性贫血因子"),
      makeIndicator("网织红细胞比例"),
    ]);
    const groups = groupUnnamedClusters(clusters, {
      [clusters[0].key]: "肾功能",
      [clusters[1].key]: "肾 功能",
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("肾功能");
    expect(groups[0].source).toBe("ai");
    expect(groups[0].clusters).toHaveLength(2);
  });
});

/* ── parseMedicalReport 网络行为：端点降级 / 422 短路 / 取消 / 超时 ── */

describe("parseMedicalReport 网络行为", () => {
  const successPayload = {
    success: true,
    pageCount: 1,
    reportDate: "2026-01-15",
    tables: [],
    indicators: [
      { rawLabel: "空腹血糖", value: 5.3, unit: "mmol/L", referenceRange: "3.9-6.1", pageIndex: 0 },
    ],
    markdown: "",
  };

  const loadFreshModule = async () => {
    vi.resetModules();
    vi.stubEnv("VITE_REPORT_PARSER_URLS", "https://ep1.example,https://ep2.example");
    return await import("@/app/services/medicalReport");
  };

  const makeResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("4xx（非 422）继续尝试下一端点并成功", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn((url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url).startsWith("https://ep1.example")) {
        return Promise.resolve(makeResponse(400, { detail: "bad request" }));
      }
      return Promise.resolve(makeResponse(200, successPayload));
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await loadFreshModule();
    const file = new File(["dummy"], "report.png", { type: "image/png" });
    const result = await mod.parseMedicalReport(file);

    expect(calls).toEqual([
      "https://ep1.example/api/parse",
      "https://ep2.example/api/parse",
    ]);
    expect(result.success).toBe(true);
    expect(result.indicators[0].rawLabel).toBe("空腹血糖");
  });

  it("422 参数校验错误短路降级链", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn((url: string | URL | Request) => {
      calls.push(String(url));
      return Promise.resolve(makeResponse(422, { detail: "validation error" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await loadFreshModule();
    const file = new File(["dummy"], "report.png", { type: "image/png" });

    await expect(mod.parseMedicalReport(file)).rejects.toThrow("解析失败 (422)");
    expect(calls).toEqual(["https://ep1.example/api/parse"]);
  });

  it("外部 signal 已取消时立即以 AbortError 拒绝", async () => {
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException("aborted", "AbortError"));
        }
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const mod = await loadFreshModule();
    const file = new File(["dummy"], "report.png", { type: "image/png" });
    const controller = new AbortController();
    controller.abort();

    await expect(
      mod.parseMedicalReport(file, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("分段循环：按 page_range 续段请求直到覆盖全部页并合并指标", async () => {
    const ranges: (string | FormDataEntryValue | null)[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      ranges.push(form.get("page_range"));
      if (ranges.length === 1) {
        return makeResponse(200, {
          success: true,
          pageCount: 12,
          reportDate: "2026-01-15",
          tables: [],
          markdown: "",
          indicators: [{ rawLabel: "A", value: 1, unit: "u", pageIndex: 0 }],
          parsedRange: [0, 11],
          totalPages: 23,
        });
      }
      return makeResponse(200, {
        success: true,
        pageCount: 11,
        tables: [],
        markdown: "",
        indicators: [
          { rawLabel: "B", value: 2, unit: "u", pageIndex: 12 },
          { rawLabel: "C", value: 3, unit: "u", pageIndex: 22 },
        ],
        parsedRange: [12, 22],
        totalPages: 23,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const mod = await loadFreshModule();
    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const progressCalls: [number, number | null][] = [];
    const result = await mod.parseMedicalReport(file, {
      onProgress: (parsed, total) => progressCalls.push([parsed, total]),
    });

    expect(ranges).toEqual([null, "12-22"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.indicators).toHaveLength(3);
    expect(result.indicators.map(i => i.rawLabel)).toEqual(["A", "B", "C"]);
    expect(result.totalPages).toBe(23);
    expect(result.pageCount).toBe(23);
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    expect(progressCalls[0]).toEqual([23, 23]);
    expect(progressCalls[progressCalls.length - 1]).toEqual([3, 23]);
  });

  it("续段未前进时报错且不无限循环", async () => {
    const fetchMock = vi.fn(async () =>
      makeResponse(200, {
        success: true,
        pageCount: 12,
        tables: [],
        markdown: "",
        indicators: [],
        parsedRange: [0, 11],
        totalPages: 23,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const mod = await loadFreshModule();
    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });

    await expect(mod.parseMedicalReport(file)).rejects.toThrow("解析超时");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("老后端（无 totalPages）单轮返回且不发起第二轮请求", async () => {
    const fetchMock = vi.fn(async () => makeResponse(200, successPayload));
    vi.stubGlobal("fetch", fetchMock);

    const mod = await loadFreshModule();
    const file = new File(["dummy"], "report.png", { type: "image/png" });

    const result = await mod.parseMedicalReport(file);
    expect(result.success).toBe(true);
    expect(result.indicators).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("超时错误文案包含等待秒数且不引用已下线的 Render", async () => {
    const fetchMock = vi.fn(() =>
      Promise.reject(new DOMException("请求超时", "AbortError")),
    );
    vi.stubGlobal("fetch", fetchMock);

    const mod = await loadFreshModule();
    const file = new File(["dummy"], "report.png", { type: "image/png" });

    await expect(mod.parseMedicalReport(file)).rejects.toThrow(/已等待 65 秒/);
    // 所有端点都被尝试
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    try {
      await mod.parseMedicalReport(file);
    } catch (error) {
      expect(String(error)).not.toContain("Render");
    }
  });
});
