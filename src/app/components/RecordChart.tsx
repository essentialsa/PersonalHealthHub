import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useState, useEffect, type ChangeEvent } from "react";
import { HealthRecord, IndicatorCategory, IndicatorItem } from "./AddRecordDialog";
import { getValueStatus } from "@/app/services/referenceRange";
import { TrendingUp, Paperclip, Pencil, Trash2, ArrowUp, ArrowDown, RefreshCw, X } from "lucide-react";
import type { HealthAttachment } from "@/app/services/attachment";
import { FileUploadZone } from "./FileUploadZone";

interface RecordChartProps {
  records: HealthRecord[];
  indicators: IndicatorItem[];
  categories: IndicatorCategory[];
  attachments?: HealthAttachment[];
  onPreviewAttachment?: (attachmentId: string) => void;
  onUpdateRecord?: (record: HealthRecord) => void;
  onDeleteRecord?: (id: string) => void;
  onAddAttachment?: (attachment: HealthAttachment) => Promise<boolean> | boolean;
  onDeleteAttachment?: (attachmentId: string) => void;
}

const CHART_VIEW_STORAGE_KEY = "health_chart_view";

export function RecordChart({ records, indicators, categories, attachments = [], onPreviewAttachment, onUpdateRecord, onDeleteRecord, onAddAttachment, onDeleteAttachment }: RecordChartProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => {
    if (typeof window === "undefined") {
      return categories[0]?.id ?? "";
    }
    try {
      const raw = window.localStorage.getItem(CHART_VIEW_STORAGE_KEY);
      if (!raw) {
        return categories[0]?.id ?? "";
      }
      const parsed = JSON.parse(raw) as { categoryId?: string };
      return parsed.categoryId && categories.find(c => c.id === parsed.categoryId)
        ? parsed.categoryId
        : categories[0]?.id ?? "";
    } catch {
      return categories[0]?.id ?? "";
    }
  });
  const [visibleIndicators, setVisibleIndicators] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      const first = categories[0];
      return first ? first.items.map(i => i.id) : [];
    }
    try {
      const raw = window.localStorage.getItem(CHART_VIEW_STORAGE_KEY);
      if (!raw) {
        const first = categories[0];
        return first ? first.items.map(i => i.id) : [];
      }
      const parsed = JSON.parse(raw) as { categoryId?: string; indicators?: string[] };
      const category = parsed.categoryId
        ? categories.find(c => c.id === parsed.categoryId)
        : categories[0];
      if (!category) {
        return [];
      }
      const fallback = category.items.map(i => i.id);
      if (!parsed.indicators || parsed.indicators.length === 0) {
        return fallback;
      }
      const valid = parsed.indicators.filter(id =>
        category.items.some(item => item.id === id)
      );
      return valid.length > 0 ? valid : fallback;
    } catch {
      const first = categories[0];
      return first ? first.items.map(i => i.id) : [];
    }
  });

  useEffect(() => {
    const currentCategory = categories.find(c => c.id === selectedCategoryId) ?? categories[0];
    if (!currentCategory) {
      setVisibleIndicators([]);
      return;
    }
    const allIds = currentCategory.items.map(i => i.id);
    const valid = visibleIndicators.filter(id => allIds.includes(id));
    if (valid.length === 0) {
      setVisibleIndicators(allIds);
    } else if (valid.length !== visibleIndicators.length) {
      setVisibleIndicators(valid);
    }
  }, [categories, selectedCategoryId, visibleIndicators]);

  useEffect(() => {
    const currentCategory = categories.find(c => c.id === selectedCategoryId);
    if (!currentCategory || visibleIndicators.length === 0) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      const payload = {
        categoryId: currentCategory.id,
        indicators: visibleIndicators,
      };
      window.localStorage.setItem(CHART_VIEW_STORAGE_KEY, JSON.stringify(payload));
    } catch {
    }
  }, [categories, selectedCategoryId, visibleIndicators]);

  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editAttachmentFile, setEditAttachmentFile] = useState<File | null>(null);
  const [editAttachmentDataUrl, setEditAttachmentDataUrl] = useState<string>("");
  const [editAttachmentMode, setEditAttachmentMode] = useState<"none" | "add" | "replace">("none");

  const getIndicatorRange = (type: string): string | undefined => {
    const indicator = indicators.find(t => t.id === type);
    return indicator?.referenceRange;
  };

  const handleStartRowEdit = (dateStr: string) => {
    const row = sortedTableData.find(r => String(r.date) === dateStr);
    if (!row) return;
    const values: Record<string, string> = {};
    activeItems.forEach(item => {
      const val = (row as Record<string, unknown>)[item.id];
      values[item.id] = typeof val === "number" ? String(val) : "";
    });
    setEditingDate(dateStr);
    setEditValues(values);
    setEditAttachmentFile(null);
    setEditAttachmentDataUrl("");
    setEditAttachmentMode("none");
  };

  const handleSaveRowEdit = async (dateStr: string) => {
    if (!onUpdateRecord) return;
    const dateRecords = records.filter(r => r.date === dateStr);

    // Handle attachment changes for all records of this date
    if (editAttachmentMode !== "none" && editAttachmentFile && editAttachmentDataUrl && onAddAttachment) {
      // Find current attachment from any record of this date
      const currentAttachmentId = dateRecords[0]?.attachmentId;

      // Delete old attachment if replacing
      if (editAttachmentMode === "replace" && currentAttachmentId && onDeleteAttachment) {
        onDeleteAttachment(currentAttachmentId);
      }

      // Create new attachment
      const newAttachmentId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const attachment: HealthAttachment = {
        id: newAttachmentId,
        fileName: editAttachmentFile.name,
        fileType: editAttachmentFile.type,
        fileSize: editAttachmentFile.size,
        data: editAttachmentDataUrl,
        date: dateStr,
        createdAt: new Date().toISOString(),
      };
      if (await onAddAttachment(attachment)) {
        // Update all records of this date with the new attachment
        dateRecords.forEach(record => {
          onUpdateRecord({ ...record, attachmentId: newAttachmentId });
        });
      }
    }

    // Update values
    activeItems.forEach(item => {
      const record = dateRecords.find(r => r.indicatorType === item.id);
      if (!record) return;
      const val = parseFloat(editValues[item.id]?.replace(",", ".") || "");
      if (Number.isFinite(val) && val >= 0 && val !== record.value) {
        onUpdateRecord({ ...record, value: val });
      }
    });

    setEditingDate(null);
    setEditValues({});
    setEditAttachmentFile(null);
    setEditAttachmentDataUrl("");
    setEditAttachmentMode("none");
  };

  const handleCancelRowEdit = () => {
    setEditingDate(null);
    setEditValues({});
    setEditAttachmentFile(null);
    setEditAttachmentDataUrl("");
    setEditAttachmentMode("none");
  };

  const handleDeleteRow = (dateStr: string) => {
    if (!onDeleteRecord) return;
    const ok = window.confirm(`确定要删除 ${dateStr} 的所有记录吗？`);
    if (!ok) return;
    const dateRecords = records.filter(r => r.date === dateStr);
    dateRecords.forEach(r => onDeleteRecord(r.id));
  };

  const selectedCategory =
    categories.find(c => c.id === selectedCategoryId) ?? categories[0];
  const categoryItems = selectedCategory ? selectedCategory.items : [];
  const activeItems = categoryItems.filter(item =>
    visibleIndicators.includes(item.id)
  );

  const indicatorIds = categoryItems.map(item => item.id);

  const groupedByDate = records
    .filter(record => indicatorIds.includes(record.indicatorType))
    .sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    .reduce<Array<Record<string, unknown>>>((acc, record) => {
      const existing = acc.find(entry => entry.date === record.date);
      if (existing) {
        existing[record.indicatorType] = record.value;
        (existing.flags as Record<string, "H" | "L" | undefined>)[record.indicatorType] = record.abnormalFlag;
        return acc;
      }
      acc.push({
        date: record.date,
        [record.indicatorType]: record.value,
        flags: { [record.indicatorType]: record.abnormalFlag },
      });
      return acc;
    }, []);

  const rawChartData = groupedByDate;

  const yAxisUnit = activeItems[0]?.unit ?? "";
  const shouldNormalize = activeItems.length > 1;
  const singleActiveItem = activeItems.length === 1 ? activeItems[0] : null;

  const formatRangeValue = (value: number) => {
    if (Number.isInteger(value)) {
      return value;
    }
    return Number(value.toFixed(2));
  };

  const indicatorRanges = categoryItems.reduce<Record<string, { min: number; max: number; hasValue: boolean }>>(
    (acc, item) => {
      acc[item.id] = { min: Infinity, max: -Infinity, hasValue: false };
      return acc;
    },
    {},
  );

  rawChartData.forEach((row) => {
    categoryItems.forEach((item) => {
      const value = (row as Record<string, unknown>)[item.id];
      if (typeof value === "number" && Number.isFinite(value)) {
        const range = indicatorRanges[item.id];
        range.min = Math.min(range.min, value);
        range.max = Math.max(range.max, value);
        range.hasValue = true;
      }
    });
  });

  const normalizedChartData = rawChartData.map((row) => {
    const next: Record<string, unknown> = {
      date: row.date,
    };
    categoryItems.forEach((item) => {
      const rawValue = (row as Record<string, unknown>)[item.id];
      const range = indicatorRanges[item.id];
      if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        const normalized =
          range && range.hasValue
            ? range.max === range.min
              ? 50
              : ((rawValue - range.min) / (range.max - range.min)) * 100
            : null;
        next[`norm_${item.id}`] =
          typeof normalized === "number" && Number.isFinite(normalized)
            ? Number(normalized.toFixed(2))
            : null;
        next[`raw_${item.id}`] = rawValue;
      } else {
        next[`norm_${item.id}`] = null;
        next[`raw_${item.id}`] = rawValue ?? null;
      }
    });
    return next;
  });

  const chartData = shouldNormalize ? normalizedChartData : rawChartData;

  const getSingleAxisDomain = () => {
    if (!singleActiveItem) {
      return undefined;
    }
    const range = indicatorRanges[singleActiveItem.id];
    if (!range || !range.hasValue) {
      return undefined;
    }
    const min = range.min;
    const max = range.max;
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return undefined;
    }
    const span = max - min;
    const basePadding = Math.max(span * 0.1, Math.max(Math.abs(min), Math.abs(max)) * 0.05, 0.5);
    if (span === 0) {
      return [min - basePadding, max + basePadding];
    }
    return [min - basePadding, max + basePadding];
  };

  const yAxisDomain = shouldNormalize ? [0, 100] : getSingleAxisDomain();
  const formatAxisTick = (value: number) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "";
    }
    const abs = Math.abs(value);
    if (abs >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (abs >= 10000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    if (abs >= 100) {
      return Number(value.toFixed(1));
    }
    return Number(value.toFixed(2));
  };

  const getColorForIndex = (index: number) => {
    const palette = [
      "#6c5ce7",
      "#0f9d6e",
      "#3b82f6",
      "#d97706",
      "#8b5cf6",
      "#ec4899",
    ];
    return palette[index % palette.length];
  };

  const handleToggleIndicator = (id: string) => {
    setVisibleIndicators(prev => {
      if (prev.includes(id)) {
        return prev.filter(itemId => itemId !== id);
      }
      return [...prev, id];
    });
  };

  const tooltipFormatter = (value: number | string, _name: string, props: { dataKey?: string; payload?: Record<string, unknown> }) => {
    const dataKey = props?.dataKey;
    const resolvedId =
      dataKey && dataKey.startsWith("norm_") ? dataKey.slice("norm_".length) : dataKey;
    const item = categoryItems.find(i => i.id === resolvedId);
    const label = item?.label ?? resolvedId ?? _name;
    const unit = item?.unit ?? "";

    if (shouldNormalize && dataKey?.startsWith("norm_")) {
      const rawValue = props?.payload?.[`raw_${resolvedId}`];
      if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
        return [`${rawValue} ${unit}`.trim(), label];
      }
      return ["-", label];
    }

    const numericValue = typeof value === "number" ? value : parseFloat(String(value));
    const displayValue = Number.isFinite(numericValue) ? numericValue : value;
    return [`${displayValue} ${unit}`.trim(), label];
  };

  const [sortAscending, setSortAscending] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    setPageIndex(0);
  }, [selectedCategoryId, visibleIndicators.join(","), records.length]);

  const sortedTableData = [...rawChartData].sort((a, b) => {
    const aDate = new Date(String(a.date));
    const bDate = new Date(String(b.date));
    return sortAscending
      ? aDate.getTime() - bDate.getTime()
      : bDate.getTime() - aDate.getTime();
  });

  const totalPages = Math.max(1, Math.ceil(sortedTableData.length / pageSize));
  const currentPage = Math.min(pageIndex, totalPages - 1);
  const start = currentPage * pageSize;
  const end = start + pageSize;
  const pageRows = sortedTableData.slice(start, end);

  return (
    <Card className="bg-white border border-[rgba(32,27,72,0.09)] rounded-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="text-2xl font-bold text-[#20203a]">
              数据趋势图
            </CardTitle>
            <CardDescription>按检验指标种类对多条曲线进行对比分析</CardDescription>
          </div>
          <Select
            value={selectedCategory?.id ?? ""}
            onValueChange={(value: string) => {
              const category = categories.find(c => c.id === value);
              setSelectedCategoryId(value);
              if (category) {
                setVisibleIndicators(category.items.map(item => item.id));
              }
            }}
          >
            <SelectTrigger className="w-[200px] border-[rgba(32,27,72,0.09)] bg-white focus:border-[#6c5ce7] focus:ring-[rgba(108,92,231,0.35)]">
              <SelectValue placeholder="选择检验指标种类" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[rgba(32,27,72,0.09)]">
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#9a9ab0]">
          <span className="px-2 py-1 rounded-full bg-[#efedfd] text-[#6d28d9] font-medium">
            提示
          </span>
          <span>点击下方图例可切换曲线显示/隐藏，再次点击可恢复显示。</span>
        </div>
        {categoryItems.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {categoryItems.map((item, index) => {
              const active = visibleIndicators.includes(item.id);
              const color = getColorForIndex(index);
              const range = indicatorRanges[item.id];
              const rangeText = range && range.hasValue
                ? `${formatRangeValue(range.min)}-${formatRangeValue(range.max)}${item.unit ? ` ${item.unit}` : ""}`
                : "无数据";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleToggleIndicator(item.id)}
                  className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs transition ${
                    active
                      ? "border-[#ede9fe] bg-[rgba(245,243,255,0.7)] text-[#20203a]"
                      : "border-[rgba(32,27,72,0.09)] bg-[#f1f1f7] text-[#9a9ab0]"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: color,
                      opacity: active ? 1 : 0.25,
                    }}
                  />
                  <span className={`flex flex-col leading-tight ${active ? "" : "line-through opacity-60"}`}>
                    <span>{item.label}</span>
                    <span className="text-[10px] text-[#9a9ab0]">
                      {rangeText}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {rawChartData.length === 0 ? (
          <div className="h-[300px] flex flex-col items-center justify-center text-[#9a9ab0]">
            <div className="w-20 h-20 rounded-full bg-[#efedfd] flex items-center justify-center mb-4">
              <TrendingUp className="w-10 h-10 text-[#6c5ce7]" />
            </div>
            <p className="text-[#5a5a75]">该类别暂时没有可展示的数据</p>
            <p className="text-sm text-[#9a9ab0] mt-1">添加记录或切换图例后可查看趋势图</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(32,27,72,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11.5, fill: '#9a9ab0' }}
                angle={-45}
                textAnchor="end"
                height={70}
                stroke="rgba(32,27,72,0.16)"
              />
              <YAxis
                label={{
                  value: yAxisUnit,
                  angle: -90,
                  position: "insideLeft",
                  fill: "#9a9ab0",
                }}
                domain={yAxisDomain}
                dataKey={!shouldNormalize && singleActiveItem ? singleActiveItem.id : undefined}
                tick={{ fontSize: 11.5, fill: '#9a9ab0' }}
                tickFormatter={formatAxisTick}
                stroke="rgba(32,27,72,0.16)"
              />
              <Tooltip
                formatter={tooltipFormatter}
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #ede9fe',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)'
                }}
              />
              {categoryItems.map((item, index) => {
                const color = getColorForIndex(index);
                const active = visibleIndicators.includes(item.id);
                const dataKey = shouldNormalize ? `norm_${item.id}` : item.id;
                return (
                  <Line
                    key={item.id}
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color}
                    strokeWidth={active ? 3 : 1.5}
                    dot={
                      active
                        ? { r: 4, fill: color, strokeWidth: 2, stroke: "#fff" }
                        : { r: 2, fill: color, strokeWidth: 0 }
                    }
                    activeDot={{ r: 6, fill: color, strokeWidth: 2, stroke: "#fff" }}
                    opacity={active ? 1 : 0}
                    isAnimationActive
                    animationDuration={500}
                    name={item.label}
                    onClick={() => handleToggleIndicator(item.id)}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
        {rawChartData.length > 0 && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-[#5a5a75]">
                指标明细表（当前类别下可见曲线对应的数据）
              </div>
              <div className="flex items-center gap-2 text-xs text-[#9a9ab0]">
                <span>
                  共 {sortedTableData.length} 条记录，当前第{" "}
                  {currentPage + 1}/{totalPages} 页
                </span>
              </div>
            </div>
            <div className="border border-[rgba(32,27,72,0.09)] rounded-[12px] overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="border-[rgba(32,27,72,0.09)] bg-[#f8f7fc] hover:bg-[#f8f7fc]">
                    <TableHead
                      className="text-[#5a5a75] text-xs w-[14%] text-center cursor-pointer select-none"
                      onClick={() => setSortAscending(prev => !prev)}
                    >
                      数据日期
                      <span className="ml-1 text-[10px] text-[#9a9ab0]">
                        {sortAscending ? "↑" : "↓"}
                      </span>
                    </TableHead>
                    {activeItems.map(item => (
                      <TableHead key={item.id} className="text-[#5a5a75] text-xs w-[14%] text-center">
                        {item.label}
                        {item.unit && (
                          <span className="ml-1 text-[10px] text-[#9a9ab0]">
                            ({item.unit})
                          </span>
                        )}
                      </TableHead>
                    ))}
                    <TableHead className="text-[#5a5a75] text-xs w-[14%] text-center">附件</TableHead>
                    <TableHead className="text-[#5a5a75] text-xs w-[14%] text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map(row => {
                    const dateStr = String(row.date);
                    const hasAttachment = records.some(r => r.date === dateStr && r.attachmentId);
                    const attachmentRecord = records.find(r => r.date === dateStr && r.attachmentId);
                    const dateRecords = records.filter(r => r.date === dateStr);
                    const isRowEditing = editingDate === dateStr;
                    return (
                    <TableRow
                      key={dateStr}
                      className="border-[rgba(32,27,72,0.09)] hover:bg-[#fafafd] transition-colors"
                    >
                      <TableCell className="text-xs text-[#5a5a75] w-[14%] text-center">
                        {dateStr}
                      </TableCell>
                      {activeItems.map(item => {
                        const value = (row as Record<string, unknown>)[item.id];
                        const range = getIndicatorRange(item.id);
                        const cellFlag = ((((row as Record<string, unknown>).flags) ?? {}) as Record<string, "H" | "L" | undefined>)[item.id];
                        const rangeStatus = getValueStatus(value, range, cellFlag);

                        return (
                          <TableCell key={item.id} className="text-xs text-[#5a5a75] w-[14%] text-center">
                            {isRowEditing && onUpdateRecord ? (
                              <Input
                                type="number"
                                step="0.1"
                                value={editValues[item.id] ?? ""}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  setEditValues(prev => ({ ...prev, [item.id]: e.target.value }))
                                }
                                className="h-7 w-full text-xs border-[rgba(32,27,72,0.12)]"
                              />
                            ) : (
                              <div className="inline-flex items-center justify-center">
                                {typeof value === "number" ? (
                                  <>
                                    <span className={`min-w-[3rem] text-center inline-block ${
                                      rangeStatus === "above"
                                        ? "text-red-500 font-medium"
                                        : rangeStatus === "below"
                                          ? "text-blue-500 font-medium"
                                          : "text-[#20203a]"
                                    }`}>
                                      {value}
                                    </span>
                                    {rangeStatus === "above" && <ArrowUp aria-label="偏高" className="w-3 h-3 text-red-500 ml-0.5" />}
                                    {rangeStatus === "below" && <ArrowDown aria-label="偏低" className="w-3 h-3 text-blue-500 ml-0.5" />}
                                  </>
                                ) : (
                                  <span className="text-[#b8b8cc]">-</span>
                                )}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center w-[14%]">
                        {isRowEditing ? (
                          <div className="flex flex-col items-center gap-1">
                            {hasAttachment && attachmentRecord?.attachmentId && editAttachmentMode === "none" && !editAttachmentFile ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  className="text-[#6c5ce7] hover:text-[#5a49d6] hover:bg-[#efedfd] rounded p-0.5"
                                  onClick={() => onPreviewAttachment?.(attachmentRecord.attachmentId!)}
                                >
                                  <Paperclip className="h-4 w-4" />
                                </button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 p-0 text-[#d97706] hover:text-[#d97706] hover:bg-[#fdf3e3]"
                                  onClick={() => setEditAttachmentMode("replace")}
                                  title="替换附件"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 p-0 text-[#f0476a] hover:text-[#f0476a] hover:bg-[#fdeef2]"
                                  onClick={() => {
                                    if (onDeleteAttachment && attachmentRecord?.attachmentId) {
                                      onDeleteAttachment(attachmentRecord.attachmentId);
                                    }
                                    setEditAttachmentMode("none");
                                  }}
                                  title="移除附件"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : editAttachmentFile ? (
                              <div className="flex items-center gap-1">
                                <Paperclip className="h-3 w-3 text-[#6c5ce7]" />
                                <span className="text-[10px] text-[#5a5a75] truncate max-w-[50px]">{editAttachmentFile.name}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 p-0 text-[#f0476a] hover:text-[#f0476a]"
                                  onClick={() => {
                                    setEditAttachmentFile(null);
                                    setEditAttachmentDataUrl("");
                                    setEditAttachmentMode("none");
                                  }}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            ) : (
                              <FileUploadZone
                                className="w-full"
                                onFileSelect={(file, dataUrl) => {
                                  setEditAttachmentFile(file);
                                  setEditAttachmentDataUrl(dataUrl);
                                  setEditAttachmentMode("add");
                                }}
                                onFileRemove={() => {
                                  setEditAttachmentFile(null);
                                  setEditAttachmentDataUrl("");
                                  setEditAttachmentMode("none");
                                }}
                                selectedFile={null}
                              />
                            )}
                          </div>
                        ) : (
                          hasAttachment && onPreviewAttachment && attachmentRecord?.attachmentId && (
                            <button
                              type="button"
                              className="text-[#6c5ce7] hover:text-[#5a49d6] hover:bg-[#efedfd] rounded p-0.5"
                              onClick={() => onPreviewAttachment(attachmentRecord.attachmentId!)}
                            >
                              <Paperclip className="h-4 w-4" />
                            </button>
                          )
                        )}
                      </TableCell>
                      <TableCell className="py-3 align-middle w-[14%] text-center">
                        {isRowEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs border-[rgba(15,157,110,0.35)] text-[#0f9d6e] hover:bg-[#e8f7f1] hover:text-[#0f9d6e]"
                              onClick={() => handleSaveRowEdit(dateStr)}
                            >
                              保存
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs border-[rgba(32,27,72,0.09)] text-[#5a5a75] hover:bg-[#f1f1f7]"
                              onClick={handleCancelRowEdit}
                            >
                              取消
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {onUpdateRecord && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-[#6c5ce7] hover:text-[#5a49d6] hover:bg-[#efedfd]"
                                onClick={() => handleStartRowEdit(dateStr)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {onDeleteRecord && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-[#f0476a] hover:text-[#f0476a] hover:bg-[#fdeef2]"
                                onClick={() => handleDeleteRow(dateStr)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 text-xs text-[#9a9ab0]">
                <span>
                  第 {currentPage + 1} / {totalPages} 页
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPageIndex(p => Math.max(0, p - 1))}
                  className="h-7 px-2 text-xs border-[rgba(32,27,72,0.09)] hover:bg-[#f1f1f7] disabled:opacity-40"
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() =>
                    setPageIndex(p => Math.min(totalPages - 1, p + 1))
                  }
                  className="h-7 px-2 text-xs border-[rgba(32,27,72,0.09)] hover:bg-[#f1f1f7] disabled:opacity-40"
                >
                  下一页
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
