import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Badge } from "@/app/components/ui/badge";
import { Progress } from "@/app/components/ui/progress";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/components/ui/utils";
import { UploadCloud, FileText, AlertCircle, CheckCircle, Loader2, X, RefreshCw, Sparkles } from "lucide-react";
import type { HealthRecord } from "@/app/components/AddRecordDialog";
import type { HealthAttachment } from "@/app/services/attachment";
import { MAX_FILE_SIZE as MAX_ATTACHMENT_SIZE } from "@/app/services/attachment";
import { recordDuplicateKey } from "@/app/services/duplicateRecords";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  parseMedicalReport,
  checkParserService,
  extractIndicatorsFromTables,
  resolveIndicators,
  groupByAction,
  getCategoriesToCreate,
  clusterUnnamedIndicators,
  groupUnnamedClusters,
  matchUnnamedLabels,
  normalizeIndicatorText,
  normalizeUnit,
  convertUnitValue,
  type ParseResult,
  type ParserServiceStatus,
  type ResolvedIndicator,
  type ExtractedIndicator,
  type UserIndicatorCategory,
  type UnnamedGroup,
} from "@/app/services/medicalReport";
import { CategorySelectDialog } from "./CategorySelectDialog";
import { compressImageFile } from "@/app/services/imageCompress";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 50 * 1024 * 1024;

/** 后端医生复核问题（ParseResult.review.issues 单条） */
type ReviewIssue = NonNullable<ParseResult["review"]>["issues"][number];

/** 未命名分组来源的徽标文案与配色 */
const GROUP_SOURCE_LABEL: Record<UnnamedGroup["source"], string> = {
  report: "报告分组",
  ai: "AI 建议",
  none: "未分组",
};
const GROUP_SOURCE_BADGE_CLASS: Record<UnnamedGroup["source"], string> = {
  report: "bg-[#e5efff] text-[#2f6fe0]",
  ai: "bg-[#efedfd] text-[#6c5ce7]",
  none: "bg-[#eeedf3] text-[#6b6880]",
};

/**
 * 未命名指标簇的重命名输入：内部持有输入状态（重聚类不重挂载、不丢焦点），
 * 在失焦/回车/采用时提交，由父级整表重跑匹配（命中用户指标库即转可导入）。
 */
function ClusterRenameInput({
  initialLabel,
  suggestion,
  onCommit,
  onSkip,
  itemCount,
}: {
  initialLabel: string;
  suggestion?: string;
  onCommit: (label: string) => void;
  onSkip: () => void;
  itemCount: number;
}) {
  const [value, setValue] = useState(initialLabel);
  const suggestionVisible = Boolean(suggestion && suggestion !== initialLabel && suggestion !== value);

  return (
    <div className="bg-white border border-[rgba(217,119,6,0.12)] rounded-lg px-[11px] py-[9px] space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={() => onCommit(value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 text-sm flex-1 rounded-[7px] bg-white"
        />
        <span className="text-[11px] text-[#9a9ab0] whitespace-nowrap shrink-0">{itemCount} 条记录</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-[#9a9ab0] hover:bg-[rgba(32,27,72,0.06)] hover:text-[#5a5a75] shrink-0"
          onMouseDown={e => e.preventDefault()}
          onClick={onSkip}
        >
          跳过
        </Button>
      </div>
      {suggestionVisible && suggestion && (
        <div className="flex items-center gap-2 pl-1">
          <Sparkles className="w-3 h-3 text-[#8b5cf6]" />
          <span className="text-[11.5px] font-medium text-[#7c5ce0]">AI 建议命名为「{suggestion}」</span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 rounded-[6px] text-[11px] px-2 border-[rgba(139,92,246,0.35)] bg-white text-[#7c5ce0] hover:bg-[#f6f3ff] hover:border-[rgba(139,92,246,0.6)] hover:text-[#7c5ce0]"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setValue(suggestion);
              onCommit(suggestion);
            }}
          >
            采用
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * 组级导入条：把整组未命名指标新增为分类前的组名确认交互。
 * 组名默认取组名本身，可编辑；确认/回车提交，取消/Esc 收起。
 */
function GroupImportBar({
  initialName,
  onConfirm,
  onCancel,
}: {
  initialName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const trimmed = value.trim();

  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (trimmed) onConfirm(trimmed);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="h-8 text-sm flex-1 rounded-[7px] bg-white"
      />
      <Button size="sm" className="h-8 text-xs shrink-0" disabled={!trimmed} onClick={() => onConfirm(trimmed)}>
        确认导入
      </Button>
      <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={onCancel}>
        取消
      </Button>
    </div>
  );
}

interface Props {
  onImportRecords: (records: HealthRecord[]) => void;
  onAddAttachment?: (attachment: HealthAttachment) => boolean;
  existingCategories?: UserIndicatorCategory[];
  existingRecords?: HealthRecord[];
  triggerClassName?: string;
  triggerLabel?: string;
  /** 整组导入：确保分类与指标项存在，返回 label → itemId 映射；null 表示失败 */
  onEnsureCategoryItems?: (groupName: string, items: { label: string; unit: string; referenceRange?: string }[]) => Record<string, string> | null;
  /** 确认导入时回填指标参考范围：仅上报库中范围为空的已匹配指标项（不覆盖已维护值） */
  onBackfillReferenceRanges?: (entries: { itemId: string; referenceRange: string }[]) => void;
}

export function MedicalReportImportDialog({ onImportRecords, onAddAttachment, existingCategories = [], existingRecords = [], triggerClassName, triggerLabel, onEnsureCategoryItems, onBackfillReferenceRanges }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"upload" | "preview">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parseProgressText, setParseProgressText] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [importDate, setImportDate] = useState("");
  const [matched, setMatched] = useState<ResolvedIndicator[]>([]);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [pendingCategories, setPendingCategories] = useState<{ categoryId: string; categoryName: string; indicators: ResolvedIndicator[] }[]>([]);
  const [serviceStatus, setServiceStatus] = useState<ParserServiceStatus | null>(null);
  const [serviceChecking, setServiceChecking] = useState(false);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [retainReport, setRetainReport] = useState(true);
  // 用户勾选强制导入的"疑似重复"记录键（同日期+同指标+同数值）
  const [forcedDuplicates, setForcedDuplicates] = useState<Set<string>>(new Set());
  // 用户勾选排除的建议项（matched 中的 index）；未勾选的建议项默认随确认导入
  const [excludedSuggested, setExcludedSuggested] = useState<Set<number>>(new Set());
  // 用户勾选排除的已匹配指标（matched 中的 index）；未勾选的已匹配指标默认导入
  const [excludedImports, setExcludedImports] = useState<Set<number>>(new Set());
  // 后端医生复核问题：预览行警示展示与采纳/忽略交互
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  // 已忽略的复核警示（key=label）：隐藏警示，值不变
  const [dismissedReviews, setDismissedReviews] = useState<Set<string>>(new Set());
  // 已采纳的复核建议（key=label → 建议值/单位）：matched 已同步改写
  const [adoptedReviews, setAdoptedReviews] = useState<Record<string, { value: number; unit: string }>>({});
  const serviceOnline = serviceStatus?.online ?? null;

  // 解析原始提取结果：未命名指标改名后整表重跑 resolveIndicators 用
  const [extracted, setExtracted] = useState<ExtractedIndicator[]>([]);
  // 对话框级取消信号：关闭/卸载时 abort 在途解析与二次匹配请求
  const abortRef = useRef<AbortController | null>(null);

  // 卸载时取消所有在途请求
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // 既有记录的重复键集合：用于预览表中标记"疑似重复"
  const existingDuplicateKeys = useMemo(
    () => new Set(existingRecords.map(recordDuplicateKey)),
    [existingRecords],
  );

  // ── 未命名指标：聚类 + 免费模型二次匹配 ──
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string>>({});
  const [aiCategories, setAiCategories] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCategoryMissed, setAiCategoryMissed] = useState(false);
  const aiRequestedRef = useRef("");
  // 正在执行「整组新增为分类」交互的组（`${source}::${name}`）
  const [importingGroupKey, setImportingGroupKey] = useState<string | null>(null);
  // 用户取消勾选「随确认导入」的未命名具名组（`${source}::${name}`）；具名组默认随确认导入
  const [excludedGroups, setExcludedGroups] = useState<Set<string>>(new Set());

  const unnamedClusters = useMemo(
    () => clusterUnnamedIndicators(matched.filter(m => m.matchType === "none")),
    [matched],
  );
  const clusterSignature = unnamedClusters.map(c => c.key).join("|");
  // 未命名簇按类别分组：报告分组优先、AI 建议兜底、未分组殿后
  const unnamedGroups = useMemo(
    () => groupUnnamedClusters(unnamedClusters, aiCategories),
    [unnamedClusters, aiCategories],
  );

  // 组键：`${source}::${name}`（excludedGroups / importingGroupKey 共用）
  const groupKeyOf = (group: UnnamedGroup) => `${group.source}::${group.name}`;

  useEffect(() => {
    if (unnamedClusters.length === 0) {
      aiRequestedRef.current = "";
      return;
    }
    if (aiRequestedRef.current === clusterSignature) {
      return;
    }
    aiRequestedRef.current = clusterSignature;
    const catalog = existingCategories.flatMap(category =>
      (category.items || []).map(item => ({ id: `${category.id}::${item.id}`, label: item.label })),
    );
    const labels = unnamedClusters.map(cluster => cluster.canonicalLabel);
    setAiLoading(true);
    void matchUnnamedLabels(labels, catalog, { signal: abortRef.current?.signal })
      .then(suggestions => {
        if (!suggestions) {
          setAiCategoryMissed(true);
          return;
        }
        if (suggestions.every(s => !s.suggestedCategory)) {
          setAiCategoryMissed(true);
        } else {
          setAiCategoryMissed(false);
        }
        const next: Record<string, string> = {};
        const nextCategories: Record<string, string> = {};
        for (const cluster of unnamedClusters) {
          const hit = suggestions.find(s =>
            normalizeIndicatorText(s.label) === cluster.key ||
            cluster.keys.some(key => key === normalizeIndicatorText(s.label)),
          );
          if (hit?.catalogLabel) {
            next[cluster.key] = hit.catalogLabel;
          }
          if (hit?.suggestedCategory) {
            nextCategories[cluster.key] = hit.suggestedCategory;
          }
        }
        setAiSuggestions(prev => ({ ...prev, ...next }));
        setAiCategories(prev => ({ ...prev, ...nextCategories }));
      })
      .finally(() => setAiLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterSignature]);

  const checkService = useCallback(async () => {
    setServiceChecking(true);
    try {
      const status = await checkParserService();
      setServiceStatus(status);
      return status;
    } finally {
      setServiceChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void checkService();
  }, [open, checkService]);

  const handleFile = async (f: File) => {
    if (!ALLOWED.includes(f.type)) { setError("仅支持 PDF、JPG、PNG 格式"); return; }
    if (f.size > MAX_SIZE) { setError("文件不能超过 50MB"); return; }
    setError(null);
    // 大图先压缩：控制请求体体积（Serverless 上限），对识别也更友好
    try {
      const { file: compressed } = await compressImageFile(f);
      setFile(compressed);
    } catch {
      setFile(f);
    }
  };

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setProgress(0);
    setParseProgressText(null);
    setTab("preview");
    abortRef.current = new AbortController();

    try {
      const r = await parseMedicalReport(file, {
        signal: abortRef.current.signal,
        onProgress: (parsed, total) => {
          // SSE 真实进度（绝对页数/总页数）；老后端未返回总页数时给估算值
          setProgress(total ? Math.round((parsed / total) * 100) : 92);
          setParseProgressText(total ? `${parsed}/${total} 页` : null);
        },
      });
      const nextExtracted =
        Array.isArray(r.indicators) && r.indicators.length > 0
          ? r.indicators
          : extractIndicatorsFromTables(r.tables);
      const resolved = resolveIndicators(nextExtracted, existingCategories);
      setMatched(resolved);
      setExtracted(nextExtracted);
      setReviewIssues(r.review?.issues ?? []);
      setDismissedReviews(new Set());
      setAdoptedReviews({});
      setAiSuggestions({});
      setAiCategories({});
      setAiCategoryMissed(false);
      setForcedDuplicates(new Set());
      setExcludedSuggested(new Set());
      setExcludedImports(new Set());
      setExcludedGroups(new Set());
      setImportingGroupKey(null);
      aiRequestedRef.current = "";
      setPendingCategories(getCategoriesToCreate(resolved));

      setProgress(100);
      setResult(r);
      setImportDate(r.reportDate || new Date().toISOString().split("T")[0]);
    } catch (e) {
      // 关闭对话框导致的取消：不再弹错误提示
      if (abortRef.current?.signal.aborted) {
        return;
      }
      setError(e instanceof Error ? e.message : "解析失败");
      setTab("upload");
    } finally {
      setParsing(false);
    }
  };

  /**
   * 已维护指标的单位换算：报告单位与维护单位归一化不同时，按常见临床系数换算
   * （无已知系数则保持原值原单位，避免错换）。
   */
  const toImportableRecord = (m: ResolvedIndicator, date: string, indicatorType: string): HealthRecord => {
    let value = m.value;
    let unit = m.unit;
    const maintainedItem = existingCategories
      .flatMap(c => c.items)
      .find(item => item.id === m.userItemId);
    const maintainedUnit = maintainedItem?.unit?.trim() || "";
    if (maintainedUnit && normalizeUnit(maintainedUnit) !== normalizeUnit(m.unit)) {
      const converted = convertUnitValue(m.value, m.unit, maintainedUnit, m.rawLabel);
      if (converted !== null) {
        value = Math.round(converted * 100) / 100;
        unit = maintainedUnit;
      }
    }
    return {
      id: `${Date.now()}_${indicatorType}_${Math.random().toString(36).slice(2, 8)}`,
      date,
      indicatorType,
      value,
      unit,
      abnormalFlag: m.abnormalFlag === "H" || m.abnormalFlag === "L" ? m.abnormalFlag : undefined,
      operationAt: new Date().toISOString(),
    };
  };

  /**
   * 构造未命名组的导入记录：每簇以 canonicalLabel 作为指标名、首条 unit 建库
   * （归一化同名合并），簇内每条记录各自成 HealthRecord，疑似重复默认跳过。
   * onEnsureCategoryItems 返回 null（建库失败）时返回 null。
   */
  const buildGroupRecords = (group: UnnamedGroup, groupName: string, date: string): HealthRecord[] | null => {
    if (!onEnsureCategoryItems) {
      return null;
    }
    // 1. 收集指标定义：每簇一条，canonicalLabel 归一化相同则合并（顺带携带报告参考范围建库）
    const defByKey = new Map<string, { label: string; unit: string; referenceRange?: string }>();
    const itemDefs: { label: string; unit: string; referenceRange?: string }[] = [];
    for (const cluster of group.clusters) {
      const key = normalizeIndicatorText(cluster.canonicalLabel);
      if (defByKey.has(key)) {
        continue;
      }
      const def = {
        label: cluster.canonicalLabel,
        unit: cluster.items[0]?.unit || "",
        referenceRange: cluster.items[0]?.referenceRange?.trim() || undefined,
      };
      defByKey.set(key, def);
      itemDefs.push(def);
    }
    // 2. 确保分类与指标项存在，拿 label → itemId 映射（null 表示失败）
    let labelToItemId: Record<string, string> | null = null;
    try {
      labelToItemId = onEnsureCategoryItems(groupName, itemDefs);
    } catch (error) {
      console.error("[报告导入] 建立分类或指标项失败", error);
    }
    if (!labelToItemId) {
      return null;
    }
    // 3. 簇内每条记录各自成记录；同日期+同指标+同数值的疑似重复默认跳过，组内互重只保留一条
    const records: HealthRecord[] = [];
    const groupSeenKeys = new Set<string>();
    for (const cluster of group.clusters) {
      const def = defByKey.get(normalizeIndicatorText(cluster.canonicalLabel));
      const itemId = def ? labelToItemId[def.label] : undefined;
      if (!itemId) {
        continue;
      }
      for (const item of cluster.items) {
        const dupKey = recordDuplicateKey({ date, indicatorType: itemId, value: item.value });
        if (existingDuplicateKeys.has(dupKey) && !forcedDuplicates.has(dupKey)) {
          continue;
        }
        if (groupSeenKeys.has(dupKey)) {
          continue;
        }
        groupSeenKeys.add(dupKey);
        records.push(toImportableRecord(item, date, itemId));
      }
    }
    return records;
  };

  const handleImport = () => {
    if (!result) return;
    const date = importDate;
    // 批次内去重键集合：同一报告多页重复出现的指标（同日期+同指标+同数值）只入库一条；
    // 与库存量去重共享口径，三条导入路径（已匹配/建议项/未命名组）共用，互不重复
    const batchSeenKeys = new Set<string>();
    // 本次将随确认导入的未命名具名组（报告分组 / AI 建议；未配置建库能力时不导入）
    const includedGroups = onEnsureCategoryItems
      ? unnamedGroups.filter(group => group.source !== "none" && !excludedGroups.has(groupKeyOf(group)))
      : [];
    let records: HealthRecord[] = matched
      .map((m, index) => ({ m, index }))
      .filter(({ m, index }) => {
        if (m.action !== "import" || !(m.userItemId || m.systemId)) return false;
        if (excludedImports.has(index)) return false;
        // 疑似重复（同日期+同指标+同数值）默认跳过，用户勾选后方可强制导入
        const dupKey = recordDuplicateKey({ date, indicatorType: (m.userItemId || m.systemId)!, value: m.value });
        const isExistingDup = existingDuplicateKeys.has(dupKey);
        const isBatchDup = batchSeenKeys.has(dupKey);
        if ((isExistingDup || isBatchDup) && !forcedDuplicates.has(dupKey)) return false;
        batchSeenKeys.add(dupKey);
        return true;
      })
      .map(({ m }) => toImportableRecord(m, date, (m.userItemId || m.systemId)!));

    // 建议项默认随确认导入：先确保分类与指标项存在，再按映射 id 生成记录
    const includedSuggested = matched
      .map((m, index) => ({ m, index }))
      .filter(({ m, index }) => (m.action === "create_item" || m.action === "create_category") && !excludedSuggested.has(index));
    if (includedSuggested.length > 0) {
      if (!onEnsureCategoryItems) {
        window.alert("未配置指标库维护能力，建议项本次不会导入。");
      } else {
        const categoryNameById = new Map(getCategoriesToCreate(matched).map(c => [c.categoryId, c.categoryName] as const));
        const groups = new Map<string, ResolvedIndicator[]>();
        for (const { m } of includedSuggested) {
          let categoryName = "";
          if (m.action === "create_item") {
            categoryName =
              existingCategories.find(c => c.id === m.categoryId)?.name || m.systemLabel || "报告导入";
          } else {
            categoryName =
              (m.categoryId ? categoryNameById.get(m.categoryId) : undefined) || m.systemLabel || "报告导入";
          }
          if (!groups.has(categoryName)) {
            groups.set(categoryName, []);
          }
          groups.get(categoryName)!.push(m);
        }
        const failedGroups: string[] = [];
        for (const [categoryName, groupItems] of groups) {
          const itemDefs = groupItems.map(g => ({
            label: g.systemLabel || g.rawLabel,
            unit: g.unit,
            referenceRange: g.referenceRange?.trim() || undefined,
          }));
          let labelToItemId: Record<string, string> | null = null;
          try {
            labelToItemId = onEnsureCategoryItems(categoryName, itemDefs);
          } catch (error) {
            console.error("[报告导入] 建立分类或指标项失败", error);
          }
          if (!labelToItemId) {
            failedGroups.push(categoryName);
            continue;
          }
          for (const g of groupItems) {
            const label = g.systemLabel || g.rawLabel;
            const itemId = labelToItemId[label];
            if (!itemId) {
              continue;
            }
            // 批次内去重：同日期+同指标+同数值只入库一条（新建项无换算，直接按报告单位判重）
            const dupKey = recordDuplicateKey({ date, indicatorType: itemId, value: g.value });
            if (batchSeenKeys.has(dupKey)) {
              continue;
            }
            batchSeenKeys.add(dupKey);
            // 新建指标项的单位即报告单位，无需换算
            records.push(toImportableRecord(g, date, itemId));
          }
        }
        if (failedGroups.length > 0) {
          window.alert(`以下分类创建失败，已跳过对应建议项：${failedGroups.join("、")}`);
        }
      }
    }

    // 未命名具名组（报告分组 / AI 建议）默认随确认导入：建库后按组导入记录；
    // 建库失败的组汇总提示（一次列出全部失败组名）
    const importedGroupItems: ResolvedIndicator[] = [];
    if (includedGroups.length > 0) {
      const failedImportGroups: string[] = [];
      for (const group of includedGroups) {
        const groupRecords = buildGroupRecords(group, group.name, date);
        if (groupRecords === null) {
          failedImportGroups.push(group.name);
          continue;
        }
        records.push(...groupRecords);
        importedGroupItems.push(...group.clusters.flatMap(cluster => cluster.items));
      }
      if (failedImportGroups.length > 0) {
        window.alert(`以下分组导入失败，已跳过：${failedImportGroups.join("、")}`);
      }
    }
    // 已随确认导入的组条目从预览中移除（与整组导入后的移除逻辑一致）
    if (importedGroupItems.length > 0) {
      const removedItems = new Set(importedGroupItems);
      setMatched(prev => prev.filter(m => !removedItems.has(m)));
    }

    // 参考范围回填：库中范围为空的已匹配指标，用报告识别出的范围补全（不覆盖用户已维护值）。
    // 只统计本次实际勾选导入的已匹配项；疑似重复被跳过的指标同样享受回填（匹配关系仍然有效）。
    if (onBackfillReferenceRanges) {
      const libraryItemById = new Map(
        existingCategories.flatMap(category => category.items.map(item => [item.id, item] as const)),
      );
      const rangeByItemId = new Map<string, string>();
      matched.forEach((m, index) => {
        if (m.action !== "import" || !m.userItemId || excludedImports.has(index)) return;
        const reportRange = (m.referenceRange || "").trim();
        if (!reportRange || rangeByItemId.has(m.userItemId)) return;
        const libraryItem = libraryItemById.get(m.userItemId);
        if (libraryItem && !(libraryItem.referenceRange ?? "").trim()) {
          rangeByItemId.set(m.userItemId, reportRange);
        }
      });
      if (rangeByItemId.size > 0) {
        onBackfillReferenceRanges(
          [...rangeByItemId].map(([itemId, referenceRange]) => ({ itemId, referenceRange })),
        );
      }
    }

    // 保留原始报告作为附件
    if (retainReport && file) {
      // 附件服务有独立的 10MB 上限（解析仍允许 50MB）：超限时导入前警告，避免悬空 attachmentId
      if (file.size > MAX_ATTACHMENT_SIZE) {
        const proceed = window.confirm(
          `报告文件超过附件大小上限（${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB），无法保留为附件。\n是否继续导入（不含附件）？`,
        );
        if (!proceed) return;
        onImportRecords(records);
        handleClose();
        return;
      }
      if (onAddAttachment) {
        const reader = new FileReader();
        reader.onload = () => {
          const attachment: HealthAttachment = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            data: reader.result as string,
            date,
            createdAt: new Date().toISOString(),
          };
          // 显式检查保存结果：失败时明确告知，且记录不引用不存在的附件
          let saved = false;
          try {
            saved = onAddAttachment(attachment);
          } catch {
            saved = false;
          }
          if (!saved) {
            window.alert("附件未保存（超出大小限制或本地存储空间不足），记录已导入，但未附带原始报告。");
          }
          const recordsWithAttachment = saved
            ? records.map(r => ({ ...r, attachmentId: attachment.id }))
            : records;
          onImportRecords(recordsWithAttachment);
          handleClose();
        };
        reader.onerror = () => setError("文件读取失败");
        reader.readAsDataURL(file);
        return;
      }
    }

    onImportRecords(records);
    handleClose();
  };

  const handleClose = () => {
    // 关闭即取消在途解析/二次匹配请求
    abortRef.current?.abort();
    abortRef.current = null;
    setOpen(false);
    setTab("upload");
    setFile(null);
    setError(null);
    setResult(null);
    setImportDate("");
    setMatched([]);
    setExtracted([]);
    setProgress(0);
    setParseProgressText(null);
    setPendingCategories([]);
    setCategoryDialogOpen(false);
    setServiceStatus(null);
    setServiceChecking(false);
    setRetainReport(true);
    setForcedDuplicates(new Set());
    setExcludedSuggested(new Set());
    setExcludedImports(new Set());
    setExcludedGroups(new Set());
    setImportingGroupKey(null);
    setAiCategoryMissed(false);
    setReviewIssues([]);
    setDismissedReviews(new Set());
    setAdoptedReviews({});
  };

  /**
   * 未命名指标改名后整表重跑匹配：新名称命中用户指标库或标准词典时，
   * 对应条目即时转为可导入（action='import'），让命名真正生效。
   */
  const applyClusterRename = (clusterItems: ResolvedIndicator[], label: string) => {
    if (!label.trim()) {
      return;
    }
    const indices = matched
      .map((m, idx) => (clusterItems.includes(m) ? idx : -1))
      .filter(idx => idx >= 0);
    if (indices.length === 0) {
      return;
    }
    const nextExtracted = extracted.map((item, idx) =>
      indices.includes(idx) ? { ...item, rawLabel: label.trim() } : item,
    );
    setExtracted(nextExtracted);
    setMatched(resolveIndicators(nextExtracted, existingCategories));
  };

  /**
   * 整组新增为分类：把组内全部簇作为新分类（或并入同名分类）一次性导入；
   * 组内条目导入后从未命名区移除（unnamedClusters 由 matched 派生，分组随之消失）。
   */
  const handleImportGroup = (group: UnnamedGroup, groupName: string) => {
    if (!onEnsureCategoryItems) {
      return;
    }
    const prevMatchedCount = group.clusters.reduce((sum, cluster) => sum + cluster.items.length, 0);
    const records = buildGroupRecords(group, groupName, importDate);
    if (records === null) {
      window.alert("导入失败：无法创建分类或指标项，请稍后重试。");
      return;
    }
    const skippedCount = prevMatchedCount - records.length;
    if (skippedCount > 0) {
      window.alert(`已导入 ${records.length} 条，跳过 ${skippedCount} 条疑似重复记录`);
    }
    onImportRecords(records);
    const groupItems = group.clusters.flatMap(cluster => cluster.items);
    setMatched(prev => prev.filter(m => !groupItems.includes(m)));
    setImportingGroupKey(null);
  };

  const handleCategoryConfirm = (actions: { groupId: string; action: "create" | "assign" | "skip"; categoryId?: string; customName?: string }[]) => {
    // TODO: Process category actions - create new categories or assign to existing ones
    console.log("Category actions:", actions);
    setCategoryDialogOpen(false);
    setPendingCategories([]);
  };

  /**
   * 采纳复核建议：按 label 把建议值写入 adoptedReviews，并同步改写 matched 中
   * 对应行的 value/unit，toImportableRecord 自然以建议值入库；建议值为空时不可采纳。
   */
  const adoptReviewSuggestion = (issue: ReviewIssue) => {
    if (issue.suggestedValue === null) return;
    const unit = issue.suggestedUnit ?? "";
    setAdoptedReviews(prev => ({ ...prev, [issue.label]: { value: issue.suggestedValue!, unit } }));
    setMatched(prev => prev.map(m =>
      m.rawLabel === issue.label ? { ...m, value: issue.suggestedValue!, unit: unit || m.unit } : m,
    ));
  };

  /** 忽略复核警示：按 label 隐藏警示，值保持不变 */
  const dismissReviewIssue = (label: string) => {
    setDismissedReviews(prev => new Set(prev).add(label));
  };

  const filtered = matched.filter(m =>
    (filter === "all" || m.confidence.level === filter) &&
    (!anomalyOnly || m.abnormalFlag === "H" || m.abnormalFlag === "L"),
  );
  const counts = { all: matched.length, high: matched.filter(m => m.confidence.level === "high").length, medium: matched.filter(m => m.confidence.level === "medium").length, low: matched.filter(m => m.confidence.level === "low").length };
  const groupedCounts = groupByAction(matched);
  const previewDate = importDate;
  // 预览用重复键：与 handleImport 的过滤口径一致
  const duplicateKeyOf = (m: ResolvedIndicator) =>
    m.userItemId || m.systemId
      ? recordDuplicateKey({ date: previewDate, indicatorType: (m.userItemId || m.systemId)!, value: m.value })
      : null;
  const duplicateCount = groupedCounts.import.filter(m => {
    const key = duplicateKeyOf(m);
    return key !== null && existingDuplicateKeys.has(key);
  }).length;
  const importableCount = (() => {
    // 与 handleImport 口径一致：库存量重复 + 批次内重复都默认跳过（强制勾选除外）
    const seen = new Set<string>();
    return groupedCounts.import.filter(m => {
      const key = duplicateKeyOf(m);
      const idx = matched.indexOf(m);
      if (idx >= 0 && excludedImports.has(idx)) return false;
      if (key === null) return true;
      const isExistingDup = existingDuplicateKeys.has(key);
      const isBatchDup = seen.has(key);
      if ((isExistingDup || isBatchDup) && !forcedDuplicates.has(key)) return false;
      seen.add(key);
      return true;
    }).length;
  })();
  const suggestedCount = groupedCounts.createCategory.length + groupedCounts.createItem.length;
  const suggestedImportCount = matched.filter(
    (m, index) => (m.action === "create_item" || m.action === "create_category") && !excludedSuggested.has(index),
  ).length;
  // 未命名具名组默认随确认导入的记录数（按簇内条数计）
  const groupImportCount = onEnsureCategoryItems
    ? unnamedGroups
        .filter(group => group.source !== "none" && !excludedGroups.has(groupKeyOf(group)))
        .reduce((sum, group) => sum + group.clusters.reduce((s, cluster) => s + cluster.items.length, 0), 0)
    : 0;
  const abnormalCount = matched.filter(m => m.abnormalFlag === "H" || m.abnormalFlag === "L").length;

  const confBadgeClass: Record<string, string> = {
    high: "bg-[#2b2950] text-white",
    medium: "bg-[#eeedf3] text-[#6b6880]",
    low: "bg-[#fdeef2] text-[#e0335c]",
  };
  const confLabel: Record<string, string> = { high: "高", medium: "中", low: "低" };
  const actionLabel: Record<ResolvedIndicator["action"], string> = {
    import: "匹配模板",
    create_category: "建议新增分类",
    create_item: "建议新增指标",
    unnamed: "未命名",
  };

  return (
    <>
      <CategorySelectDialog
        open={categoryDialogOpen}
        groups={pendingCategories.map(c => ({
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          indicators: c.indicators.map(i => ({ rawLabel: i.rawLabel, value: i.value, unit: i.unit, systemLabel: i.systemLabel })),
        }))}
        existingCategories={existingCategories.map(c => ({ id: c.id, name: c.name }))}
        onClose={() => setCategoryDialogOpen(false)}
        onConfirm={handleCategoryConfirm}
      />
      <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button className={cn("gap-2", triggerClassName)}>
          <FileText className="w-4 h-4" />
          {triggerLabel ?? "报告导入"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pr-10">
          <DialogTitle className="flex w-full items-center gap-3 text-[20px] font-bold leading-snug tracking-[-0.018em]">
            <span className="w-10 h-10 rounded-[12px] flex-none flex items-center justify-center bg-[linear-gradient(140deg,#6c5ce7_0%,#7c6ef0_45%,#06b6d4_100%)] shadow-[0_10px_22px_rgba(108,92,231,0.38),inset_0_1px_0_rgba(255,255,255,0.35)]">
              <FileText className="w-5 h-5 text-white" />
            </span>
            报告导入
            {result && (
              <div className="ml-auto flex items-center gap-2">
                <span className="inline-flex items-center h-[26px] px-[11px] rounded-full bg-[#f1f1f7] text-[12px] font-medium text-[#5a5a75] whitespace-nowrap">{result.pageCount} 页</span>
                <input type="date" value={importDate} onChange={e => setImportDate(e.target.value)}
                  className="h-[26px] w-32 px-[11px] rounded-full bg-[#f1f1f7] border-0 text-[12px] font-medium text-[#4b4b63] outline-none cursor-pointer transition-shadow focus:ring-[3px] focus:ring-[rgba(108,92,231,0.18)]" />
                <span className="inline-flex items-center h-[26px] px-[11px] rounded-full bg-[#f1f1f7] text-[12px] font-medium text-[#5a5a75] whitespace-nowrap">{matched.length} 项指标</span>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* 服务状态 */}
        <div className="flex items-center gap-2 text-[13.5px]">
          {serviceChecking && (
            <span className="flex items-center gap-1.5 text-[#9a9ab0]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 检测中...</span>
          )}
          {!serviceChecking && serviceOnline === true && (
            <span className="flex items-center gap-1.5 font-medium text-[#0f9d6e]">
              <CheckCircle className="w-[15px] h-[15px]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c08a] shadow-[0_0_0_3px_rgba(34,192,138,0.16)] flex-none" />
              解析服务就绪（{serviceStatus?.endpoint || "已连接"}）
            </span>
          )}
          {!serviceChecking && serviceOnline === false && (
            <span className="flex items-center gap-1.5 font-medium text-[#f0476a]">
              <AlertCircle className="w-[15px] h-[15px]" />
              解析服务未启动
              <button className="underline ml-1" onClick={() => void checkService()}>
                刷新
              </button>
              {serviceStatus?.message ? (
                <span className="text-xs text-[#9a9ab0] ml-1 max-w-[560px] truncate">{serviceStatus.message}</span>
              ) : null}
            </span>
          )}
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as "upload" | "preview")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">上传文件</TabsTrigger>
            <TabsTrigger value="preview" disabled={!result && !parsing}>预览确认</TabsTrigger>
          </TabsList>

          {/* 上传 */}
          <TabsContent value="upload" className="space-y-4 pt-[18px]">
            <div
              className="relative flex flex-col items-center text-center px-8 py-9 rounded-2xl border-2 border-dashed border-[rgba(108,92,231,0.42)] bg-[radial-gradient(circle_150px_at_50%_38%,rgba(108,92,231,0.09)_0%,rgba(108,92,231,0.035)_60%,transparent_78%),#fbfaff] cursor-pointer overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-[rgba(108,92,231,0.66)] hover:shadow-[0_10px_30px_rgba(108,92,231,0.10)]"
              onClick={() => document.getElementById("mr-file")?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <span className="absolute -top-[84px] w-[260px] h-[260px] rounded-full bg-[radial-gradient(circle,rgba(108,92,231,0.10)_0%,transparent_68%)] pointer-events-none" aria-hidden="true" />
              <input id="mr-file" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <span className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center mb-3.5 bg-[radial-gradient(circle_at_35%_28%,#ffffff_0%,#ece9ff_68%,#e2ddff_100%)] shadow-[0_12px_28px_rgba(108,92,231,0.22),inset_0_0_0_1px_rgba(108,92,231,0.10)]">
                <UploadCloud className="w-[34px] h-[34px] text-[#8b7cf0]" />
              </span>
              <p className="relative text-[14.5px] font-medium text-[#6f6a8c]">拖拽文件到此处，或<b className="font-bold text-transparent bg-clip-text bg-[linear-gradient(92deg,#6c5ce7,#5b63e8)]">点击选择</b></p>
              <p className="relative text-[12.5px] text-[#a5a3bd] mt-[7px] tracking-[0.01em]">支持 PDF / JPG / PNG，最大 50MB</p>
            </div>

            {file && (
              <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-[rgba(241,241,247,0.62)] border border-[rgba(108,92,231,0.07)]">
                <span className="w-[30px] h-[30px] rounded-[9px] flex-none flex items-center justify-center bg-[linear-gradient(140deg,rgba(108,92,231,0.14),rgba(139,92,246,0.12))] text-[#6c5ce7]">
                  <FileText className="w-[15px] h-[15px]" />
                </span>
                <span className="text-[13.5px] font-medium text-[#20203a] flex-1 min-w-0 truncate">{file.name}</span>
                <span className="text-[12px] text-[#9a9ab0] tabular-nums flex-none">{(file.size / 1024).toFixed(1)} KB</span>
                <Button variant="ghost" size="icon" className="w-6 h-6 flex-none text-[#9a9ab0] hover:text-[#f0476a] hover:bg-[#fdeef2]" onClick={() => { setFile(null); setError(null); }}><X className="w-3 h-3" /></Button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-[13px] font-medium text-[#e0335c] bg-[#fdeef2] rounded-[10px] px-3.5 py-3">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2.5">
              <Button variant="outline" onClick={handleClose}>取消</Button>
              <Button disabled={!file || parsing} onClick={handleParse}>
                {parsing ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> 解析中...</> : "开始解析"}
              </Button>
            </div>
          </TabsContent>

          {/* 预览 */}
          <TabsContent value="preview" className="space-y-4 pt-[18px]">
            {parsing && (
              <div className="space-y-2 rounded-xl border border-[rgba(108,92,231,0.14)] bg-[#faf9fe] px-4 py-3.5">
                <div className="flex items-center gap-2 text-[13.5px] font-medium text-[#5a5a75]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#6c5ce7]" /> 正在解析体检报告...
                  {parseProgressText && <span className="text-xs text-[#9a9ab0]">（{parseProgressText}）</span>}
                </div>
                <p className="text-xs text-[#9a9ab0]">
                  首次使用需要唤醒云端 OCR 服务，多页或高清报告可能需要 1-3 分钟。
                </p>
                <div className="flex items-center gap-2">
                  <Progress value={progress} className="flex-1" />
                  <span className="text-xs text-[#9a9ab0] tabular-nums shrink-0">{Math.round(progress)}%</span>
                </div>
              </div>
            )}

            {result && !parsing && (
              <>
                {/* 筛选 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {(["all", "high", "medium", "low"] as const).map(f => (
                    <Button
                      key={f}
                      variant={filter === f ? "default" : "outline"}
                      size="sm"
                      className={filter === f
                        ? "h-[30px] px-[15px] text-[12.5px] shadow-[0_6px_14px_rgba(108,92,231,0.32),inset_0_1px_0_rgba(255,255,255,0.28)]"
                        : "h-[30px] px-[15px] text-[12.5px] bg-white border-[rgba(108,92,231,0.30)] text-[#5a49d6] shadow-[0_1px_2px_rgba(108,92,231,0.06)] hover:bg-[#f8f7ff] hover:border-[rgba(108,92,231,0.55)] hover:text-[#5a49d6]"}
                      onClick={() => setFilter(f)}
                    >
                      {f === "all" ? `全部 (${counts.all})` : `${confLabel[f]} (${counts[f]})`}
                    </Button>
                  ))}
                  <Button
                    variant={anomalyOnly ? "default" : "outline"}
                    size="sm"
                    className={anomalyOnly
                      ? "h-[30px] px-[15px] text-[12.5px] shadow-[0_6px_14px_rgba(108,92,231,0.32),inset_0_1px_0_rgba(255,255,255,0.28)]"
                      : "h-[30px] px-[15px] text-[12.5px] bg-white border-[rgba(108,92,231,0.30)] text-[#5a49d6] shadow-[0_1px_2px_rgba(108,92,231,0.06)] hover:bg-[#f8f7ff] hover:border-[rgba(108,92,231,0.55)] hover:text-[#5a49d6]"}
                    onClick={() => setAnomalyOnly(v => !v)}
                  >
                    仅看异常 ({abnormalCount})
                  </Button>
                </div>

                {/* 表格 */}
                <div className="border border-[rgba(32,27,72,0.08)] rounded-[14px] overflow-hidden shadow-[0_2px_10px_rgba(24,16,66,0.04)]">
                <Table className="[&_td]:whitespace-normal [&_th]:whitespace-normal [&_th]:bg-[#faf9fe] [&_th]:text-[12px] [&_th]:font-semibold [&_th]:text-[#9a9ab0] [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:h-auto [&_td]:px-3.5 [&_td]:py-2.5 [&_td]:text-[13px] [&_td]:text-[#5a5a75] [&_td]:align-top">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-[rgba(32,27,72,0.08)]">
                      <TableHead>指标名称</TableHead>
                      <TableHead className="text-right">数值</TableHead>
                      <TableHead>单位</TableHead>
                      <TableHead>参考范围</TableHead>
                      <TableHead>处理方式</TableHead>
                      <TableHead className="text-center">置信度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-[#9a9ab0] py-8">无数据</TableCell></TableRow>
                    )}
                    {filtered.map((m, i) => {
                      const dupKey = duplicateKeyOf(m);
                      const isDuplicate = m.action === "import" && dupKey !== null && existingDuplicateKeys.has(dupKey);
                      const forceChecked = isDuplicate && dupKey !== null && forcedDuplicates.has(dupKey);
                      const matchedIndex = matched.indexOf(m);
                      const isExcluded = m.action === "import" && matchedIndex >= 0 && excludedImports.has(matchedIndex);
                      // 复核警示：命中未忽略的复核问题时展示；已采纳显示灰色徽标
                      const reviewIssue = reviewIssues.find(i => i.label === m.rawLabel);
                      const isAdopted = reviewIssue !== undefined && adoptedReviews[reviewIssue.label] !== undefined;
                      const showReviewWarning = reviewIssue !== undefined && !dismissedReviews.has(reviewIssue.label);
                      return (
                      <TableRow key={i} className={
                        m.action !== "import"
                          ? "bg-[rgba(217,119,6,0.055)] hover:bg-[rgba(217,119,6,0.085)]"
                          : (m.abnormalFlag === "H" || m.abnormalFlag === "L")
                            ? "bg-[rgba(240,71,106,0.055)] hover:bg-[rgba(240,71,106,0.085)]"
                            : m.confidence.level === "low"
                              ? "bg-[rgba(240,71,106,0.04)] hover:bg-[rgba(240,71,106,0.085)]"
                              : "hover:bg-[rgba(108,92,231,0.035)]"
                      }>
                        <TableCell className="font-semibold text-[#20203a] min-w-[7rem] break-words">{m.rawLabel}</TableCell>
                        <TableCell className="text-right font-semibold text-[#20203a] tabular-nums">
                          {m.value}
                          {m.abnormalFlag === "H" && <span className="inline-flex items-center justify-center w-[15px] h-[15px] ml-[5px] rounded-[5px] bg-[#f0476a] text-white text-[10px] font-extrabold leading-none shadow-[0_2px_5px_rgba(240,71,106,0.35)] align-[1px]">↑</span>}
                          {m.abnormalFlag === "L" && <span className="inline-flex items-center justify-center w-[15px] h-[15px] ml-[5px] rounded-[5px] bg-[#3b82f6] text-white text-[10px] font-extrabold leading-none shadow-[0_2px_5px_rgba(59,130,246,0.35)] align-[1px]">↓</span>}
                        </TableCell>
                        <TableCell className="text-[#55536e]">{m.unit}</TableCell>
                        <TableCell className="text-[#9a9ab0] text-xs">{m.referenceRange || "-"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={m.action === "import"
                              ? "text-xs bg-[linear-gradient(135deg,#5b4fd6_0%,#6c5ce7_100%)] text-white shadow-[0_2px_6px_rgba(108,92,231,0.30)]"
                              : "text-xs bg-[#eeedf3] text-[#6b6880]"}
                          >
                            {actionLabel[m.action]}
                          </Badge>
                          {showReviewWarning && reviewIssue && (
                            <div className="mt-1 space-y-0.5">
                              <div className="flex items-center gap-1">
                                {isAdopted ? (
                                  <Badge variant="secondary" className="text-[10px] bg-[#eeedf3] text-[#6b6880]">已采纳</Badge>
                                ) : (
                                  <>
                                    <Badge variant="secondary" className="text-[10px] bg-[#fdeedc] text-[#c2620a]">复核警示</Badge>
                                    {reviewIssue.confidence === "high" && (
                                      <span className="text-[10px] text-[#c2620a]">高置信</span>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="text-[11px] text-[#c2620a]">{reviewIssue.issue}</div>
                              {reviewIssue.suggestedValue !== null && (
                                <div className="text-[11px] text-[#c2620a]">
                                  建议 {reviewIssue.suggestedValue}{reviewIssue.suggestedUnit ? ` ${reviewIssue.suggestedUnit}` : ""}
                                </div>
                              )}
                              {!isAdopted && (
                                <div className="flex items-center gap-1">
                                  {reviewIssue.suggestedValue !== null && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 rounded-[6px] text-[11px] px-2 border-[#f0c98f] bg-white text-[#c2620a] hover:bg-[#fff8ee] hover:border-[#e0a95f] hover:text-[#c2620a]"
                                      onClick={() => adoptReviewSuggestion(reviewIssue)}
                                    >
                                      采纳
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 rounded-[6px] text-[11px] px-2 text-[#9a9ab0] hover:bg-[rgba(32,27,72,0.06)] hover:text-[#5a5a75]"
                                    onClick={() => dismissReviewIssue(reviewIssue.label)}
                                  >
                                    忽略
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                          {isDuplicate && (
                            <div className="mt-1 flex items-center gap-1">
                              <Badge variant="destructive" className="text-[10px]">疑似重复</Badge>
                              <label className="flex items-center gap-1 text-[11px] text-[#9a9ab0]">
                                <Checkbox
                                  checked={forceChecked}
                                  onCheckedChange={checked => {
                                    setForcedDuplicates(prev => {
                                      const next = new Set(prev);
                                      if (checked && dupKey !== null) {
                                        next.add(dupKey);
                                      } else if (dupKey !== null) {
                                        next.delete(dupKey);
                                      }
                                      return next;
                                    });
                                  }}
                                />
                                仍导入
                              </label>
                            </div>
                          )}
                          {m.action === "import" && matchedIndex >= 0 && (
                            <div className="mt-1 flex items-center gap-1">
                              <label className="flex items-center gap-1 text-[11px] text-[#9a9ab0]">
                                <Checkbox
                                  checked={isExcluded}
                                  onCheckedChange={checked => {
                                    setExcludedImports(prev => {
                                      const next = new Set(prev);
                                      if (checked) {
                                        next.add(matchedIndex);
                                      } else {
                                        next.delete(matchedIndex);
                                      }
                                      return next;
                                    });
                                  }}
                                />
                                排除
                              </label>
                            </div>
                          )}
                          {m.action !== "import" && m.systemLabel ? (
                            <div className="mt-1 text-[11px] text-[#9a9ab0]">建议：{m.systemLabel}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className={cn("text-xs", confBadgeClass[m.confidence.level])}>{confLabel[m.confidence.level]}</Badge>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>

                {/* 标准词典建议 */}
                {suggestedCount > 0 && (
                  <div className="mt-4 rounded-xl border border-[rgba(59,130,246,0.22)] bg-[rgba(239,246,255,0.55)] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-[#3b82f6]" />
                      <h4 className="text-[13.5px] font-semibold text-[#1d5bbf]">将随确认导入（{suggestedImportCount} 项，勾选排除的不导入）</h4>
                    </div>
                    <div className="space-y-2 text-[13px] text-[#1e3a6b]">
                      {matched.map((m, index) => ({ m, index }))
                        .filter(({ m }) => m.action === "create_item" || m.action === "create_category")
                        .map(({ m, index }) => (
                          <div key={`suggestion-${index}`} className="rounded-[9px] border border-[rgba(59,130,246,0.10)] bg-white px-[13px] py-[9px] flex items-center gap-2.5">
                            <span>
                              {m.rawLabel} → {m.systemLabel || "待确认"}
                              <span className="ml-2 text-[11.5px] font-medium text-[#4f8de8]">
                                {m.action === "create_item" ? "已有分类，建议新增指标" : "建议新增分类"}
                              </span>
                            </span>
                            <label className="ml-auto flex items-center gap-1.5 text-xs text-[#2f6fe0] shrink-0">
                              <Checkbox
                                checked={excludedSuggested.has(index)}
                                onCheckedChange={checked => {
                                  setExcludedSuggested(prev => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      next.add(index);
                                    } else {
                                      next.delete(index);
                                    }
                                    return next;
                                  });
                                }}
                              />
                              排除
                            </label>
                          </div>
                        ))}
                    </div>
                    <p className="text-[12px] text-[#9a9ab0] mt-2.5 leading-relaxed">
                      以下项目默认随「确认导入」一并创建分类/指标并导入；如需跳过请勾选排除。
                    </p>
                  </div>
                )}

                {/* 未匹配指标区域：按类别分组展示 */}
                {matched.filter(m => m.matchType === "none").length > 0 && (
                  <div className="mt-4 rounded-xl border border-[rgba(217,119,6,0.22)] bg-[rgba(255,251,235,0.55)] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-[#d97706]" />
                      <h4 className="text-[13.5px] font-semibold text-[#92560a]">未命名指标（{matched.filter(m => m.matchType === "none").length} 项，{unnamedGroups.length} 组）</h4>
                    </div>
                    <div className="space-y-3">
                      {unnamedGroups.map(group => {
                        const groupKey = `${group.source}::${group.name}`;
                        const canImportGroup = Boolean(onEnsureCategoryItems);
                        const importing = canImportGroup && importingGroupKey === groupKey;
                        const includedInImport = group.source !== "none" && !excludedGroups.has(groupKey);
                        // 「仅看异常」只影响展示：隐藏无异常条目的簇，簇全被隐藏则整组隐藏
                        const visibleClusters = anomalyOnly
                          ? group.clusters.filter(cluster =>
                              cluster.items.some(item => item.abnormalFlag === "H" || item.abnormalFlag === "L"),
                            )
                          : group.clusters;
                        if (visibleClusters.length === 0) {
                          return null;
                        }
                        return (
                          <div key={groupKey} className="rounded-xl border border-[#f3ddb6] bg-[rgba(255,255,255,0.72)] p-[13px]">
                            <div className="flex flex-wrap items-center gap-2 gap-y-1 mb-2.5">
                              <h5 className="text-[13.5px] font-semibold text-[#7c4a12]">{group.name}</h5>
                              <Badge variant="secondary" className={cn("text-[11px]", GROUP_SOURCE_BADGE_CLASS[group.source])}>
                                {GROUP_SOURCE_LABEL[group.source]}
                              </Badge>
                              <span className="text-[11px] text-[#9a9ab0]">{group.clusters.length} 簇</span>
                              {canImportGroup && group.source !== "none" && (
                                <label className="ml-auto flex items-center gap-1.5 text-xs text-[#b7791f] shrink-0">
                                  <Checkbox
                                    checked={includedInImport}
                                    onCheckedChange={checked => {
                                      setExcludedGroups(prev => {
                                        const next = new Set(prev);
                                        if (checked) {
                                          next.delete(groupKey);
                                        } else {
                                          next.add(groupKey);
                                        }
                                        return next;
                                      });
                                    }}
                                  />
                                  随确认导入
                                </label>
                              )}
                              {canImportGroup && !importing && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={cn("h-7 rounded-[7px] border-[#ecc589] bg-white px-3 text-[12px] text-[#b7791f] hover:bg-[#fffaf0] hover:border-[#dda452] hover:text-[#b7791f] shrink-0", group.source === "none" && "ml-auto")}
                                  onClick={() => setImportingGroupKey(groupKey)}
                                >
                                  整组新增为分类
                                </Button>
                              )}
                            </div>
                            {importing && (
                              <GroupImportBar
                                initialName={group.source === "none" ? "" : group.name}
                                onConfirm={name => handleImportGroup(group, name)}
                                onCancel={() => setImportingGroupKey(null)}
                              />
                            )}
                            <div className="space-y-2">
                              {visibleClusters.map(cluster => {
                                const suggestion = aiSuggestions[cluster.key];
                                // 稳定 key：簇首条目在 matched 中的位置（重跑匹配后位置不变，组件不重挂载）
                                const stableKey = matched.indexOf(cluster.items[0]);
                                return (
                                  <ClusterRenameInput
                                    key={stableKey}
                                    initialLabel={cluster.canonicalLabel}
                                    suggestion={suggestion}
                                    itemCount={cluster.items.length}
                                    onCommit={label => applyClusterRename(cluster.items, label)}
                                    onSkip={() => {
                                      setMatched(prev => prev.filter(m => !cluster.items.includes(m)));
                                    }}
                                  />
                                );
                              })}
                            </div>
                            {group.source === 'none' && aiCategoryMissed && (
                              <p className="text-xs text-[#9a9ab0] mt-2">AI 分类建议未返回（解析服务可能未更新或模型无法判断），可逐簇命名，或整组新增为分类。</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[12px] text-[#9a9ab0] mt-2.5 leading-relaxed">
                      💦 {aiLoading ? "AI 正在生成命名建议…" : "写法相近的指标已自动归为一组，命名一次即可应用到整组；可直接修改或点击「跳过」忽略"}
                    </p>
                  </div>
                )}

                {/* 统计信息 */}
                <div className="flex items-center gap-6 flex-wrap text-[13px] text-[#9a9ab0] mb-2 pt-0.5">
                  <span>可导入: {importableCount}</span>
                  {duplicateCount > 0 && <span className="text-[#f0476a] font-medium">疑似重复: {duplicateCount}（默认跳过）</span>}
                  <span>建议维护: {suggestedCount}</span>
                  <span>未命名: {groupedCounts.unnamed.length}</span>
                  {abnormalCount > 0 && <span className="text-[#f0476a] font-medium">异常: {abnormalCount}</span>}
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="retain-report"
                    checked={retainReport}
                    onCheckedChange={(checked) => setRetainReport(checked === true)}
                  />
                  <label htmlFor="retain-report" className="text-[13px] font-medium text-[#4b4b63]">
                    保留原始报告作为附件
                  </label>
                </div>

                <div className="sticky bottom-0 z-10 -mx-6 mt-4 border-t border-[rgba(32,27,72,0.09)] bg-[rgba(255,255,255,0.95)] px-6 pt-[13px] pb-[13px] backdrop-blur-[10px] flex justify-end gap-2.5">
                  <Button variant="outline" onClick={() => { setTab("upload"); setResult(null); setMatched([]); setReviewIssues([]); setDismissedReviews(new Set()); setAdoptedReviews({}); }}>
                    <RefreshCw className="w-4 h-4 mr-1 text-[#6c5ce7]" /> 重新上传
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={importableCount === 0 && suggestedImportCount === 0 && groupImportCount === 0}
                    className="shadow-[0_10px_24px_rgba(108,92,231,0.40),inset_0_1px_0_rgba(255,255,255,0.32)]"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    确认导入 ({importableCount + suggestedImportCount + groupImportCount} 条)
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
      </Dialog>
    </>
  );
}
