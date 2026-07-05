import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useState, useEffect, type ChangeEvent } from "react";
import { HealthRecord, IndicatorCategory, IndicatorItem } from "./AddRecordDialog";
import { TrendingUp, Paperclip, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import type { HealthAttachment } from "@/app/services/attachment";

interface RecordChartProps {
  records: HealthRecord[];
  indicators: IndicatorItem[];
  categories: IndicatorCategory[];
  attachments?: HealthAttachment[];
  onPreviewAttachment?: (attachmentId: string) => void;
  onUpdateRecord?: (record: HealthRecord) => void;
}

const CHART_VIEW_STORAGE_KEY = "health_chart_view";

export function RecordChart({ records, indicators, categories, attachments = [], onPreviewAttachment, onUpdateRecord }: RecordChartProps) {
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const parseReferenceRange = (range?: string): { min?: number; max?: number } | null => {
    if (!range) return null;
    const cleaned = range.replace(/[^\d.\-~～]/g, "").replace(/[~～]/g, "-");
    const parts = cleaned.split("-").filter(Boolean);
    if (parts.length === 2) {
      const min = parseFloat(parts[0]);
      const max = parseFloat(parts[1]);
      if (!isNaN(min) && !isNaN(max)) return { min, max };
    }
    return null;
  };

  const checkRange = (value: number, range?: string): "above" | "below" | "normal" => {
    const parsed = parseReferenceRange(range);
    if (!parsed) return "normal";
    if (parsed.max !== undefined && value > parsed.max) return "above";
    if (parsed.min !== undefined && value < parsed.min) return "below";
    return "normal";
  };

  const getIndicatorRange = (type: string): string | undefined => {
    const indicator = indicators.find(t => t.id === type);
    return indicator?.referenceRange;
  };

  const handleStartEdit = (recordId: string, value: number) => {
    setEditingId(recordId);
    setEditValue(String(value));
  };

  const handleSaveEdit = (record: HealthRecord) => {
    if (!onUpdateRecord) return;
    const parsed = parseFloat(editValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert("请输入有效的非负数值。");
      return;
    }
    onUpdateRecord({ ...record, value: parsed });
    setEditingId(null);
    setEditValue("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue("");
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
        return acc;
      }
      acc.push({
        date: record.date,
        [record.indicatorType]: record.value,
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
      "#6366f1",
      "#22c55e",
      "#f97316",
      "#ec4899",
      "#0ea5e9",
      "#a855f7",
      "#facc15",
      "#14b8a6",
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
    <Card className="bg-white/60 backdrop-blur-xl border-0 shadow-xl shadow-blue-100/50">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="text-2xl bg-gradient-to-r from-blue-600 to-pink-600 bg-clip-text text-transparent">
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
            <SelectTrigger className="w-[200px] border-violet-200 focus:border-violet-400 focus:ring-violet-400 bg-white/80">
              <SelectValue placeholder="选择检验指标种类" />
            </SelectTrigger>
            <SelectContent className="bg-white/95 backdrop-blur-xl border-violet-200">
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
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="px-2 py-1 rounded-full bg-violet-50 text-violet-700">
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
                      ? "border-violet-200 bg-violet-50 text-gray-700 shadow-sm"
                      : "border-gray-200 bg-gray-50 text-gray-400"
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
                    <span className="text-[10px] text-gray-400">
                      {rangeText}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {rawChartData.length === 0 ? (
          <div className="h-[300px] flex flex-col items-center justify-center text-gray-500">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-pink-100 flex items-center justify-center mb-4">
              <TrendingUp className="w-10 h-10 text-blue-400" />
            </div>
            <p className="text-gray-600">该类别暂时没有可展示的数据</p>
            <p className="text-sm text-gray-400 mt-1">添加记录或切换图例后可查看趋势图</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9d5ff" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12, fill: '#6b7280' }}
                angle={-45}
                textAnchor="end"
                height={70}
                stroke="#c4b5fd"
              />
              <YAxis 
                label={{
                  value: shouldNormalize ? "标准化值 (0-100)" : yAxisUnit,
                  angle: -90,
                  position: "insideLeft",
                  fill: "#6b7280",
                }}
                domain={yAxisDomain}
                dataKey={!shouldNormalize && singleActiveItem ? singleActiveItem.id : undefined}
                tick={{ fill: '#6b7280' }}
                tickFormatter={formatAxisTick}
                stroke="#c4b5fd"
              />
              <Tooltip 
                formatter={tooltipFormatter}
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                  backdropFilter: 'blur(12px)',
                  borderRadius: '12px',
                  border: '1px solid #e9d5ff',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
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
              <div className="text-sm text-gray-700">
                指标明细表（当前类别下可见曲线对应的数据）
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>
                  共 {sortedTableData.length} 条记录，当前第{" "}
                  {currentPage + 1}/{totalPages} 页
                </span>
              </div>
            </div>
            <div className="border border-violet-100 overflow-hidden bg-white/40">
              <Table>
                <TableHeader>
                  <TableRow className="border-violet-100 bg-violet-50/60">
                    <TableHead
                      className="text-gray-700 text-xs w-[13%] cursor-pointer select-none"
                      onClick={() => setSortAscending(prev => !prev)}
                    >
                      数据日期
                      <span className="ml-1 text-[10px] text-gray-400">
                        {sortAscending ? "↑" : "↓"}
                      </span>
                    </TableHead>
                    {activeItems.map(item => (
                      <TableHead key={item.id} className="text-gray-700 text-xs w-[13%]">
                        {item.label}
                        {item.unit && (
                          <span className="ml-1 text-[10px] text-gray-400">
                            ({item.unit})
                          </span>
                        )}
                      </TableHead>
                    ))}
                    <TableHead className="text-gray-700 text-xs w-[13%]">参考范围</TableHead>
                    <TableHead className="text-gray-700 text-xs w-[13%]">附件</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map(row => {
                    const dateStr = String(row.date);
                    const hasAttachment = records.some(r => r.date === dateStr && r.attachmentId);
                    const attachmentRecord = records.find(r => r.date === dateStr && r.attachmentId);
                    const dateRecords = records.filter(r => r.date === dateStr);
                    return (
                    <TableRow
                      key={dateStr}
                      className="border-violet-100 hover:bg-violet-50/30 transition-colors"
                    >
                      <TableCell className="text-xs text-gray-700 w-[13%]">
                        {dateStr}
                      </TableCell>
                      {activeItems.map(item => {
                        const value = (row as Record<string, unknown>)[item.id];
                        const record = dateRecords.find(r => r.indicatorType === item.id);
                        const isEditing = editingId === record?.id;
                        const range = getIndicatorRange(item.id);
                        const rangeStatus = checkRange(typeof value === "number" ? value : 0, range);

                        return (
                          <TableCell key={item.id} className="text-xs text-gray-700 w-[13%]">
                            {isEditing && onUpdateRecord ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={editValue}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                                  className="h-7 w-20 text-xs border-violet-200"
                                  autoFocus
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-1 text-xs text-emerald-600"
                                  onClick={() => record && handleSaveEdit(record)}
                                >
                                  ✓
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-1 text-xs text-gray-500"
                                  onClick={handleCancelEdit}
                                >
                                  ✗
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                {typeof value === "number" ? (
                                  <>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      rangeStatus === "above" || rangeStatus === "below"
                                        ? "bg-red-50 text-red-600"
                                        : "text-gray-700"
                                    }`}>
                                      {value}
                                    </span>
                                    {rangeStatus === "above" && <ArrowUp className="w-3 h-3 text-red-500" />}
                                    {rangeStatus === "below" && <ArrowDown className="w-3 h-3 text-red-500" />}
                                    {record && onUpdateRecord && (
                                      <button
                                        type="button"
                                        className="text-gray-400 hover:text-violet-600 ml-0.5"
                                        onClick={() => handleStartEdit(record.id, value)}
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-xs text-gray-500 w-[13%]">
                        {activeItems.length > 0 ? (getIndicatorRange(activeItems[0].id) || "-") : "-"}
                      </TableCell>
                      <TableCell className="text-center w-[13%]">
                        {hasAttachment && onPreviewAttachment && attachmentRecord?.attachmentId && (
                          <button
                            type="button"
                            className="text-violet-500 hover:text-violet-600 hover:bg-violet-50 rounded p-0.5"
                            onClick={() => onPreviewAttachment(attachmentRecord.attachmentId!)}
                          >
                            <Paperclip className="h-4 w-4" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
                <span>
                  第 {currentPage + 1} / {totalPages} 页
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPageIndex(p => Math.max(0, p - 1))}
                  className="h-7 px-2 text-xs border-violet-200 hover:bg-violet-50 disabled:opacity-40"
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
                  className="h-7 px-2 text-xs border-violet-200 hover:bg-violet-50 disabled:opacity-40"
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
