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

/** 未命名分组来源的徽标文案与配色 */
const GROUP_SOURCE_LABEL: Record<UnnamedGroup["source"], string> = {
  report: "报告分组",
  ai: "AI 建议",
  none: "未分组",
};
const GROUP_SOURCE_BADGE_CLASS: Record<UnnamedGroup["source"], string> = {
  report: "bg-blue-100 text-blue-700",
  ai: "bg-violet-100 text-violet-700",
  none: "bg-muted text-muted-foreground",
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
    <div className="bg-white rounded-md p-2 space-y-1">
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
          className="h-8 text-sm flex-1"
        />
        <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">{itemCount} 条记录</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground shrink-0"
          onMouseDown={e => e.preventDefault()}
          onClick={onSkip}
        >
          跳过
        </Button>
      </div>
      {suggestionVisible && suggestion && (
        <div className="flex items-center gap-2 pl-1">
          <Sparkles className="w-3 h-3 text-violet-500" />
          <span className="text-xs text-violet-600">AI 建议命名为「{suggestion}」</span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2 border-violet-200 text-violet-600"
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
        className="h-8 text-sm flex-1"
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
  onEnsureCategoryItems?: (groupName: string, items: { label: string; unit: string }[]) => Record<string, string> | null;
}

export function MedicalReportImportDialog({ onImportRecords, onAddAttachment, existingCategories = [], existingRecords = [], triggerClassName, triggerLabel, onEnsureCategoryItems }: Props) {
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
  const [retainReport, setRetainReport] = useState(true);
  // 用户勾选强制导入的"疑似重复"记录键（同日期+同指标+同数值）
  const [forcedDuplicates, setForcedDuplicates] = useState<Set<string>>(new Set());
  // 用户勾选排除的建议项（matched 中的 index）；未勾选的建议项默认随确认导入
  const [excludedSuggested, setExcludedSuggested] = useState<Set<number>>(new Set());
  // 用户勾选排除的已匹配指标（matched 中的 index）；未勾选的已匹配指标默认导入
  const [excludedImports, setExcludedImports] = useState<Set<number>>(new Set());
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
          setProgress(total ? Math.min(96, Math.round((parsed / total) * 100)) : 92);
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
    // 1. 收集指标定义：每簇一条，canonicalLabel 归一化相同则合并
    const defByKey = new Map<string, { label: string; unit: string }>();
    const itemDefs: { label: string; unit: string }[] = [];
    for (const cluster of group.clusters) {
      const key = normalizeIndicatorText(cluster.canonicalLabel);
      if (defByKey.has(key)) {
        continue;
      }
      const def = { label: cluster.canonicalLabel, unit: cluster.items[0]?.unit || "" };
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
    // 3. 簇内每条记录各自成记录；同日期+同指标+同数值的疑似重复默认跳过
    const records: HealthRecord[] = [];
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
        records.push(toImportableRecord(item, date, itemId));
      }
    }
    return records;
  };

  const handleImport = () => {
    if (!result) return;
    const date = importDate;
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
        return !existingDuplicateKeys.has(dupKey) || forcedDuplicates.has(dupKey);
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
          const itemDefs = groupItems.map(g => ({ label: g.systemLabel || g.rawLabel, unit: g.unit }));
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

  const filtered = matched.filter(m => filter === "all" || m.confidence.level === filter);
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
  const importableCount = groupedCounts.import.filter(m => {
    const key = duplicateKeyOf(m);
    const idx = matched.indexOf(m);
    if (idx >= 0 && excludedImports.has(idx)) return false;
    return key === null || !existingDuplicateKeys.has(key) || forcedDuplicates.has(key);
  }).length;
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

  const confColor: Record<string, "default" | "secondary" | "destructive"> = { high: "default", medium: "secondary", low: "destructive" };
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
        <Button
          className={cn(
            "gap-2 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 shadow-lg shadow-violet-200 hover:shadow-xl hover:shadow-violet-300 transition-all duration-300",
            triggerClassName,
          )}
        >
          <FileText className="w-4 h-4" />
          {triggerLabel ?? "报告导入"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            报告导入
            {result && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-1">{result.pageCount} 页</span>
                <input type="date" value={importDate} onChange={e => setImportDate(e.target.value)}
                  className="text-xs bg-muted text-gray-700 rounded-full px-2.5 py-1 border-0 focus:outline-1 focus:outline-violet-400" />
                <span className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-1">{matched.length} 项指标</span>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* 服务状态 */}
        <div className="flex items-center gap-2 text-sm">
          {serviceChecking && (
            <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 检测中...</span>
          )}
          {!serviceChecking && serviceOnline === true && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-3.5 h-3.5" />
              解析服务就绪（{serviceStatus?.endpoint || "已连接"}）
            </span>
          )}
          {!serviceChecking && serviceOnline === false && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertCircle className="w-3.5 h-3.5" />
              解析服务未启动
              <button className="underline ml-1" onClick={() => void checkService()}>
                刷新
              </button>
              {serviceStatus?.message ? (
                <span className="text-xs text-muted-foreground ml-1 max-w-[560px] truncate">{serviceStatus.message}</span>
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
          <TabsContent value="upload" className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-purple-300 transition-colors"
              onClick={() => document.getElementById("mr-file")?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <input id="mr-file" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <UploadCloud className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">拖拽文件到此处，或点击选择</p>
              <p className="text-xs text-muted-foreground mt-1">支持 PDF / JPG / PNG，最大 50MB</p>
            </div>

            {file && (
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                <FileText className="w-4 h-4 text-purple-600" />
                <span className="text-sm flex-1 truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => { setFile(null); setError(null); }}><X className="w-3 h-3" /></Button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>取消</Button>
              <Button disabled={!file || parsing} onClick={handleParse}>
                {parsing ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> 解析中...</> : "开始解析"}
              </Button>
            </div>
          </TabsContent>

          {/* 预览 */}
          <TabsContent value="preview" className="space-y-4">
            {parsing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> 正在解析体检报告...
                  {parseProgressText && <span className="text-xs text-muted-foreground">（{parseProgressText}）</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  首次使用需要唤醒云端 OCR 服务，多页或高清报告可能需要 1-3 分钟。
                </p>
                <div className="flex items-center gap-2">
                  <Progress value={progress} className="flex-1" />
                  <span className="text-xs text-muted-foreground shrink-0">{Math.round(progress)}%</span>
                </div>
              </div>
            )}

            {result && !parsing && (
              <>
                {/* 筛选 */}
                <div className="flex gap-2">
                  {(["all", "high", "medium", "low"] as const).map(f => (
                    <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
                      {f === "all" ? `全部 (${counts.all})` : `${confLabel[f]} (${counts[f]})`}
                    </Button>
                  ))}
                </div>

                {/* 表格 */}
                <Table className="[&_td]:whitespace-normal [&_th]:whitespace-normal">
                  <TableHeader>
                    <TableRow>
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
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">无数据</TableCell></TableRow>
                    )}
                    {filtered.map((m, i) => {
                      const dupKey = duplicateKeyOf(m);
                      const isDuplicate = m.action === "import" && dupKey !== null && existingDuplicateKeys.has(dupKey);
                      const forceChecked = isDuplicate && dupKey !== null && forcedDuplicates.has(dupKey);
                      const matchedIndex = matched.indexOf(m);
                      const isExcluded = m.action === "import" && matchedIndex >= 0 && excludedImports.has(matchedIndex);
                      return (
                      <TableRow key={i} className={m.action !== "import" ? "bg-orange-50" : (m.abnormalFlag === "H" || m.abnormalFlag === "L") ? "bg-red-50/40" : m.confidence.level === "low" ? "bg-red-50/50" : undefined}>
                        <TableCell className="font-medium min-w-[7rem] break-words">{m.rawLabel}</TableCell>
                        <TableCell className="text-right">
                          {m.value}
                          {m.abnormalFlag === "H" && <Badge variant="destructive" className="ml-1 text-[10px]">↑</Badge>}
                          {m.abnormalFlag === "L" && <Badge variant="secondary" className="ml-1 text-[10px] text-blue-600">↓</Badge>}
                        </TableCell>
                        <TableCell>{m.unit}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{m.referenceRange || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={m.action === "import" ? "default" : "secondary"} className="text-xs">
                            {actionLabel[m.action]}
                          </Badge>
                          {isDuplicate && (
                            <div className="mt-1 flex items-center gap-1">
                              <Badge variant="destructive" className="text-[10px]">疑似重复</Badge>
                              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
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
                              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
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
                            <div className="mt-1 text-[11px] text-muted-foreground">建议：{m.systemLabel}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={confColor[m.confidence.level]} className="text-xs">{confLabel[m.confidence.level]}</Badge>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* 标准词典建议 */}
                {suggestedCount > 0 && (
                  <div className="mt-4 border rounded-lg p-4 bg-blue-50/50">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-blue-600" />
                      <h4 className="font-medium text-blue-800">将随确认导入（{suggestedImportCount} 项，勾选排除的不导入）</h4>
                    </div>
                    <div className="space-y-2 text-sm text-blue-900">
                      {matched.map((m, index) => ({ m, index }))
                        .filter(({ m }) => m.action === "create_item" || m.action === "create_category")
                        .map(({ m, index }) => (
                          <div key={`suggestion-${index}`} className="rounded-md bg-white px-3 py-2 flex items-center gap-2">
                            <span>
                              {m.rawLabel} → {m.systemLabel || "待确认"}
                              <span className="ml-2 text-xs text-blue-500">
                                {m.action === "create_item" ? "已有分类，建议新增指标" : "建议新增分类"}
                              </span>
                            </span>
                            <label className="ml-auto flex items-center gap-1.5 text-xs text-blue-700 shrink-0">
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
                    <p className="text-xs text-muted-foreground mt-2">
                      以下项目默认随「确认导入」一并创建分类/指标并导入；如需跳过请勾选排除。
                    </p>
                  </div>
                )}

                {/* 未匹配指标区域：按类别分组展示 */}
                {matched.filter(m => m.matchType === "none").length > 0 && (
                  <div className="mt-4 border rounded-lg p-4 bg-amber-50/50">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <h4 className="font-medium text-amber-800">未命名指标（{matched.filter(m => m.matchType === "none").length} 项，{unnamedGroups.length} 组）</h4>
                    </div>
                    <div className="space-y-3">
                      {unnamedGroups.map(group => {
                        const groupKey = `${group.source}::${group.name}`;
                        const canImportGroup = Boolean(onEnsureCategoryItems);
                        const importing = canImportGroup && importingGroupKey === groupKey;
                        const includedInImport = group.source !== "none" && !excludedGroups.has(groupKey);
                        return (
                          <div key={groupKey} className="rounded-lg border border-amber-200 bg-white/70 p-3">
                            <div className="flex flex-wrap items-center gap-2 gap-y-1 mb-2">
                              <h5 className="text-sm font-medium text-amber-900">{group.name}</h5>
                              <Badge variant="secondary" className={cn("text-[11px]", GROUP_SOURCE_BADGE_CLASS[group.source])}>
                                {GROUP_SOURCE_LABEL[group.source]}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">{group.clusters.length} 簇</span>
                              {canImportGroup && group.source !== "none" && (
                                <label className="ml-auto flex items-center gap-1.5 text-xs text-amber-700 shrink-0">
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
                                  className={cn("h-7 border-amber-300 text-xs text-amber-700 shrink-0", group.source === "none" && "ml-auto")}
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
                              {group.clusters.map(cluster => {
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
                              <p className="text-xs text-muted-foreground mt-2">AI 分类建议未返回（解析服务可能未更新或模型无法判断），可逐簇命名，或整组新增为分类。</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      💦 {aiLoading ? "AI 正在生成命名建议…" : "写法相近的指标已自动归为一组，命名一次即可应用到整组；可直接修改或点击「跳过」忽略"}
                    </p>
                  </div>
                )}

                {/* 统计信息 */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2 pt-2">
                  <span>可导入: {importableCount}</span>
                  {duplicateCount > 0 && <span className="text-red-600">疑似重复: {duplicateCount}（默认跳过）</span>}
                  <span>建议维护: {suggestedCount}</span>
                  <span>未命名: {groupedCounts.unnamed.length}</span>
                  {abnormalCount > 0 && <span className="text-red-600">异常: {abnormalCount}</span>}
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="retain-report"
                    checked={retainReport}
                    onCheckedChange={(checked) => setRetainReport(checked === true)}
                  />
                  <label htmlFor="retain-report" className="text-sm text-gray-700">
                    保留原始报告作为附件
                  </label>
                </div>

                <div className="sticky bottom-0 z-10 -mx-6 mt-4 border-t bg-white/95 px-6 pt-3 pb-1 backdrop-blur flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setTab("upload"); setResult(null); setMatched([]); }}>
                    <RefreshCw className="w-4 h-4 mr-1" /> 重新上传
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={importableCount === 0 && suggestedImportCount === 0 && groupImportCount === 0}
                    className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 text-white shadow-lg shadow-violet-200"
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
