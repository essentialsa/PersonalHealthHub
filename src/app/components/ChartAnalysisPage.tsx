import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartArea, ChartBar, ChartLine, ChevronsDown, ChevronsUp, LayoutGrid, Minus } from "lucide-react";
import type { HealthRecord, IndicatorCategory, IndicatorItem } from "@/app/components/AddRecordDialog";
import { getValueStatus, scoreAgainstRange } from "@/app/services/referenceRange";

const CHART_VIEW_STORAGE_KEY = "health_chart_view";
const CHART_LINE_COLORS = [
  "#6c5ce7",
  "#0f9d6e",
  "#3b82f6",
  "#d97706",
  "#8b5cf6",
  "#ec4899",
];
const GRID_COLOR = "rgba(32,27,72,0.06)";
const TICK_COLOR = "#9a9ab0";

type TimeRange = "7d" | "30d" | "90d" | "all";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7天" },
  { value: "30d", label: "30天" },
  { value: "90d", label: "90天" },
  { value: "all", label: "全部" },
];

const CHART_TYPES = ["line", "area", "bar"] as const;
type ChartType = (typeof CHART_TYPES)[number];

type ChartViewMode = "cards" | "overlay";

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(2)));
};

const shortDateLabel = (date: string) => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
};

interface OverlaySeries {
  item: IndicatorItem;
  color: string;
}

export interface RadarSeriesPoint {
  value: number;
}

export interface RadarSeries {
  item: Pick<IndicatorItem, "label" | "referenceRange">;
  points: RadarSeriesPoint[];
}

/**
 * 健康雷达评分：基于参考范围对最新值打分（scoreAgainstRange）。
 * 无参考范围/不可评分的指标不纳入；可评分指标不足 3 个时返回 null（隐藏雷达卡）。
 */
export function buildRadarData(indicatorSeries: RadarSeries[]) {
  const scores = indicatorSeries
    .map(series => {
      const latest = series.points[series.points.length - 1]?.value;
      const score = scoreAgainstRange(latest, series.item.referenceRange);
      return score === null ? null : { label: series.item.label, score };
    })
    .filter((entry): entry is { label: string; score: number } => entry !== null);
  if (scores.length < 3) {
    return null;
  }
  const avg = scores.reduce((sum, entry) => sum + entry.score, 0) / scores.length;
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  const worst = scores.reduce((a, b) => (b.score < a.score ? b : a));
  return {
    data: scores.map(entry => ({ indicator: entry.label, score: Number(entry.score.toFixed(1)) })),
    score: Math.round(avg),
    best: best.label,
    worst: worst.label,
  };
}

/** 叠加图 tooltip：按日期列出各可见指标的原始值+单位 */
function OverlayTooltip({
  active,
  payload,
  visibleSeries,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown> }>;
  visibleSeries: OverlaySeries[];
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload;
  return (
    <div className="rounded-[12px] border border-[#ede9fe] bg-white px-3 py-2 text-xs shadow-[0_2px_6px_rgba(0,0,0,0.05)]">
      <div className="text-[#9a9ab0] mb-1">{String(row.rawDate)}</div>
      {visibleSeries.map(series => {
        const raw = row[`raw_${series.item.id}`];
        if (raw === undefined) {
          return null;
        }
        return (
          <div key={series.item.id} className="flex items-center gap-1.5 text-[#5a5a75]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: series.color }} />
            <span>{series.item.label}：</span>
            <span className="font-semibold text-[#20203a]">
              {formatNumber(Number(raw))}
              {series.item.unit || ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function readStoredView(): { categoryId?: string; timeRange?: TimeRange; viewMode?: string } {
  try {
    const raw = window.localStorage.getItem(CHART_VIEW_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

interface ChartAnalysisPageProps {
  records: HealthRecord[];
  categories: IndicatorCategory[];
  searchQuery: string;
}

export function ChartAnalysisPage({ records, categories, searchQuery }: ChartAnalysisPageProps) {
  const storedView = useMemo(readStoredView, []);
  const [categoryId, setCategoryId] = useState<string>(storedView.categoryId ?? "");
  const [timeRange, setTimeRange] = useState<TimeRange>(storedView.timeRange ?? "all");
  const [viewMode, setViewMode] = useState<ChartViewMode>(
    storedView.viewMode === "overlay" ? "overlay" : "cards",
  );
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }
    if (!categories.some(category => category.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CHART_VIEW_STORAGE_KEY,
        JSON.stringify({ categoryId, timeRange, viewMode, indicators: [] }),
      );
    } catch {
      // 忽略持久化失败（隐私模式等场景）
    }
  }, [categoryId, timeRange, viewMode]);

  // 切换分类时重置图例显隐（旧分类的指标 id 不再适用）
  useEffect(() => {
    setHiddenIds(new Set());
  }, [categoryId]);

  const category = categories.find(item => item.id === categoryId) ?? categories[0] ?? null;

  const cutoffMs = useMemo(() => {
    if (timeRange === "all") {
      return 0;
    }
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }, [timeRange]);

  const query = searchQuery.trim().toLowerCase();

  const indicatorSeries = useMemo(() => {
    if (!category) {
      return [];
    }
    return category.items
      .filter(item => item.enabled !== false)
      .filter(item => !query || item.label.toLowerCase().includes(query))
      .map((item, index) => {
        const points = records
          .filter(
            record =>
              record.indicatorType === item.id && new Date(record.date).getTime() >= cutoffMs,
          )
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(record => ({
            rawDate: record.date,
            label: shortDateLabel(record.date),
            value: record.value,
            flag: record.abnormalFlag ?? null,
          }));
        return { item, points, color: CHART_LINE_COLORS[index % CHART_LINE_COLORS.length] };
      })
      .filter(series => series.points.length > 0);
  }, [category, records, cutoffMs, query]);

  const radarData = useMemo(() => buildRadarData(indicatorSeries), [indicatorSeries]);

  /** 叠加视图：可见线、是否归一化、按日期合并的数据行 */
  const overlayVisibleSeries = indicatorSeries.filter(series => !hiddenIds.has(series.item.id));
  // 仅剩一条可见线时退回原始值坐标轴；多条时各指标按自身 min-max 归一化
  const useNormalization = overlayVisibleSeries.length > 1;
  const overlayUnit = !useNormalization && overlayVisibleSeries.length === 1 ? overlayVisibleSeries[0].item.unit || "" : "";
  const overlayRows = useMemo(() => {
    const byDate = new Map<string, Record<string, unknown>>();
    for (const series of indicatorSeries) {
      const values = series.points.map(point => point.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      for (const point of series.points) {
        let row = byDate.get(point.rawDate);
        if (!row) {
          row = { rawDate: point.rawDate, label: point.label };
          byDate.set(point.rawDate, row);
        }
        row[`raw_${series.item.id}`] = point.value;
        row[series.item.id] =
          useNormalization && max !== min
            ? Number((((point.value - min) / (max - min)) * 100).toFixed(1))
            : useNormalization
              ? 50
              : point.value;
      }
    }
    return Array.from(byDate.values()).sort(
      (a, b) => new Date(String(a.rawDate)).getTime() - new Date(String(b.rawDate)).getTime(),
    );
  }, [indicatorSeries, useNormalization]);

  const renderChart = (type: ChartType, series: (typeof indicatorSeries)[number]) => {
    const axisProps = {
      tick: { fontSize: 11.5, fill: TICK_COLOR },
      tickLine: false,
      axisLine: { stroke: GRID_COLOR },
    } as const;
    const tooltip = (
      <Tooltip
        contentStyle={{
          borderRadius: 12,
          border: "1px solid #ede9fe",
          background: "#ffffff",
          fontSize: 12,
        }}
        labelFormatter={label => `日期：${label}`}
        formatter={(value: number | string) => [`${formatNumber(Number(value))} ${series.item.unit || ""}`, series.item.label]}
      />
    );
    if (type === "bar") {
      return (
        <BarChart data={series.points} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis domain={["auto", "auto"]} {...axisProps} />
          {tooltip}
          <Bar dataKey="value" fill={series.color} radius={[6, 6, 0, 0]} maxBarSize={38} />
        </BarChart>
      );
    }
    if (type === "area") {
      return (
        <AreaChart data={series.points} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id={`grad-${series.item.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series.color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis domain={["auto", "auto"]} {...axisProps} />
          {tooltip}
          <Area
            type="monotone"
            dataKey="value"
            stroke={series.color}
            strokeWidth={2.5}
            fill={`url(#grad-${series.item.id})`}
            dot={{ r: 3, strokeWidth: 2, stroke: series.color, fill: "#ffffff" }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      );
    }
    return (
      <LineChart data={series.points} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis domain={["auto", "auto"]} {...axisProps} />
        {tooltip}
        <Line
          type="monotone"
          dataKey="value"
          stroke={series.color}
          strokeWidth={2.5}
          dot={{ r: 3, strokeWidth: 2, stroke: series.color, fill: "#ffffff" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    );
  };

  return (
    <div className="bg-white border border-[rgba(32,27,72,0.09)] rounded-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[rgba(32,27,72,0.09)] flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-[#20203a]">趋势分析</h3>
          <p className="text-[12.5px] text-[#9a9ab0] mt-0.5">查看各项指标的历史变化趋势</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-[12px] bg-[rgba(245,243,255,0.7)] border border-[#ede9fe]" role="group" aria-label="图表展示模式">
            {(
              [
                ["cards", "分指标卡片", LayoutGrid],
                ["overlay", "多指标对比", ChartLine],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={viewMode === value}
                onClick={() => setViewMode(value)}
                className={`inline-flex items-center gap-1.5 px-3 h-7 rounded-[9px] text-[12.5px] font-medium transition-colors ${
                  viewMode === value
                    ? "bg-white text-[#6d28d9] font-semibold shadow-[0_2px_8px_rgba(108,92,231,0.18)]"
                    : "text-[#5a5a75] hover:text-[#20203a]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-[12px] bg-[rgba(245,243,255,0.7)] border border-[#ede9fe]">
            {TIME_RANGES.map(range => (
              <button
                key={range.value}
                type="button"
                onClick={() => setTimeRange(range.value)}
                className={`px-3.5 h-7 rounded-[9px] text-[12.5px] font-medium transition-colors ${
                  timeRange === range.value
                    ? "bg-white text-[#6d28d9] font-semibold shadow-[0_2px_8px_rgba(108,92,231,0.18)]"
                    : "text-[#5a5a75] hover:text-[#20203a]"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          <select
            value={category?.id ?? ""}
            onChange={event => setCategoryId(event.target.value)}
            aria-label="选择检验指标种类"
            className="h-[34px] pl-3.5 pr-9 rounded-[10px] border-0 bg-[#f1f1f7] text-[13px] font-medium text-[#20203a] outline-none transition-colors hover:bg-[#e8e8f2] focus:ring-2 focus:ring-[rgba(108,92,231,0.35)] appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239a9ab0%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_10px_center]"
          >
            {categories.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-5">
        {!category || category.items.filter(item => item.enabled !== false).length === 0 ? (
          <div className="border border-[rgba(32,27,72,0.09)] bg-[#fafafd] h-40 rounded-[14px] flex flex-col items-center justify-center text-[#9a9ab0] text-sm">
            暂无可展示的指标数据
          </div>
        ) : indicatorSeries.length === 0 ? (
          <div className="border border-[rgba(32,27,72,0.09)] bg-[#fafafd] h-40 rounded-[14px] flex flex-col items-center justify-center text-[#9a9ab0] text-sm gap-1">
            <span>{query ? "没有匹配搜索关键词的指标" : "当前时间范围内暂无数据"}</span>
            {query && <span className="text-xs">清空搜索框可查看全部指标</span>}
          </div>
        ) : viewMode === "overlay" ? (
          <div className="bg-[#fafafd] border border-[rgba(32,27,72,0.09)] rounded-[14px] p-5">
            <div className="text-[13.5px] font-semibold text-[#20203a]">
              {`${category?.name ?? ""} · 多指标对比`}
              <span className="ml-2 text-[11.5px] font-normal text-[#9a9ab0]">
                {useNormalization
                  ? "纵轴为归一化值（0-100），悬停查看原始值"
                  : `纵轴为原始值${overlayUnit ? `（单位：${overlayUnit}）` : ""}`}
              </span>
            </div>
            <div className="h-[320px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overlayRows} margin={{ top: 12, right: 16, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11.5, fill: TICK_COLOR }}
                    tickLine={false}
                    axisLine={{ stroke: GRID_COLOR }}
                  />
                  <YAxis
                    domain={useNormalization ? [0, 100] : ["auto", "auto"]}
                    tick={{ fontSize: 11.5, fill: TICK_COLOR }}
                    tickLine={false}
                    axisLine={{ stroke: GRID_COLOR }}
                    {...(overlayUnit
                      ? {
                          label: {
                            value: overlayUnit,
                            angle: -90,
                            position: "insideLeft",
                            style: { fontSize: 11.5, fill: TICK_COLOR, textAnchor: "middle" },
                          },
                        }
                      : {})}
                  />
                  <Tooltip content={<OverlayTooltip visibleSeries={overlayVisibleSeries} />} />
                  {overlayVisibleSeries.map(series => (
                    <Line
                      key={series.item.id}
                      type="monotone"
                      dataKey={series.item.id}
                      stroke={series.color}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 pt-3 border-t border-[rgba(32,27,72,0.09)] flex flex-wrap gap-2">
              {indicatorSeries.map(series => {
                const hidden = hiddenIds.has(series.item.id);
                return (
                  <button
                    key={series.item.id}
                    type="button"
                    aria-pressed={!hidden}
                    onClick={() =>
                      setHiddenIds(prev => {
                        const next = new Set(prev);
                        if (next.has(series.item.id)) {
                          next.delete(series.item.id);
                        } else {
                          next.add(series.item.id);
                        }
                        return next;
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                      hidden
                        ? "border-[rgba(32,27,72,0.09)] bg-[#f1f1f7] text-[#b8b8cc] line-through"
                        : "border-[#ede9fe] bg-[rgba(245,243,255,0.7)] text-[#5a5a75] hover:bg-[#efedfd]"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: hidden ? "#b8b8cc" : series.color }}
                    />
                    {series.item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {indicatorSeries.map((series, index) => {
              const values = series.points.map(point => point.value);
              const max = Math.max(...values);
              const min = Math.min(...values);
              const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
              const latest = values[values.length - 1];
              const delta = latest - values[0];
              const deltaText =
                delta === 0 ? "持平" : `${delta > 0 ? "+" : "-"}${formatNumber(Math.abs(delta))}${series.item.unit || ""}`;
              const chartType = CHART_TYPES[index % CHART_TYPES.length];
              const latestFlag = series.points[series.points.length - 1].flag;
              const rangeStatus = getValueStatus(latest, series.item.referenceRange, latestFlag);
              return (
                <div
                  key={series.item.id}
                  className="bg-[#fafafd] border border-[rgba(32,27,72,0.09)] rounded-[14px] p-4 flex flex-col gap-3 hover:shadow-[0_2px_6px_rgba(0,0,0,0.05)] transition-shadow duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-[#20203a]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: series.color }} />
                      {series.item.label}
                      {series.item.unit ? (
                        <span className="text-[11.5px] font-medium text-[#9a9ab0]">({series.item.unit})</span>
                      ) : null}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-[11.5px] font-semibold ${
                        rangeStatus === "unknown"
                          ? "bg-[#f1f1f7] text-[#9a9ab0]"
                          : rangeStatus === "normal"
                            ? "bg-[#e8f7f1] text-[#0f9d6e]"
                            : "bg-[#fdeef2] text-[#f0476a]"
                      }`}
                    >
                      <span className="w-[5px] h-[5px] rounded-full bg-current" />
                      {rangeStatus === "unknown"
                        ? "无参考"
                        : rangeStatus === "normal"
                          ? "正常"
                          : rangeStatus === "above"
                            ? "偏高"
                            : "偏低"}
                    </span>
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      {renderChart(chartType, series)}
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-[24px] font-bold tracking-[-0.02em] leading-none text-[#20203a]">
                      {formatNumber(latest)}
                      {series.item.unit ? (
                        <span className="ml-1 text-[12.5px] font-medium text-[#9a9ab0]">{series.item.unit}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[12px] font-semibold ${
                          delta === 0 ? "text-[#9a9ab0]" : delta > 0 ? "text-[#0f9d6e]" : "text-[#f0476a]"
                        }`}
                      >
                        {delta === 0 ? (
                          <Minus className="w-3 h-3" />
                        ) : delta > 0 ? (
                          <ChevronsUp className="w-3 h-3" />
                        ) : (
                          <ChevronsDown className="w-3 h-3" />
                        )}
                        {deltaText}
                      </span>
                      <span className="inline-flex items-center gap-1 h-[26px] px-2 rounded-[8px] bg-[#f1f1f7]" aria-hidden="true">
                        <ChartLine className={`w-[13px] h-[13px] ${chartType === "line" ? "text-[#6c5ce7]" : "text-[#9a9ab0]"}`} />
                        <ChartArea className={`w-[13px] h-[13px] ${chartType === "area" ? "text-[#6c5ce7]" : "text-[#9a9ab0]"}`} />
                        <ChartBar className={`w-[13px] h-[13px] ${chartType === "bar" ? "text-[#6c5ce7]" : "text-[#9a9ab0]"}`} />
                      </span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-[rgba(32,27,72,0.09)] grid grid-cols-4 text-center">
                    <div>
                      <div className="text-[11.5px] text-[#9a9ab0]">最高</div>
                      <div className="text-[13.5px] font-semibold text-[#5a5a75]">{formatNumber(max)}</div>
                    </div>
                    <div>
                      <div className="text-[11.5px] text-[#9a9ab0]">最低</div>
                      <div className="text-[13.5px] font-semibold text-[#5a5a75]">{formatNumber(min)}</div>
                    </div>
                    <div>
                      <div className="text-[11.5px] text-[#9a9ab0]">平均</div>
                      <div className="text-[13.5px] font-semibold text-[#5a5a75]">{formatNumber(avg)}</div>
                    </div>
                    <div>
                      <div className="text-[11.5px] text-[#9a9ab0]">当前</div>
                      <div className="text-[13.5px] font-semibold text-[#6c5ce7]">{formatNumber(latest)}</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {radarData && (
              <div className="bg-[#fafafd] border border-[rgba(32,27,72,0.09)] rounded-[14px] p-4 flex flex-col gap-3 hover:shadow-[0_2px_6px_rgba(0,0,0,0.05)] transition-shadow duration-200">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-[#20203a]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "#6c5ce7" }} />
                    健康指标雷达
                  </span>
                  <span className="inline-flex items-center h-[22px] px-2.5 rounded-full bg-[#efedfd] text-[#6d28d9] text-[11.5px] font-semibold">
                    按参考范围评分
                  </span>
                </div>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData.data} cx="50%" cy="50%" outerRadius="72%">
                      <PolarGrid stroke={GRID_COLOR} />
                      <PolarAngleAxis dataKey="indicator" tick={{ fontSize: 11.5, fill: TICK_COLOR }} />
                      <Radar
                        dataKey="score"
                        stroke="#6c5ce7"
                        fill="#6c5ce7"
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #ede9fe",
                          background: "#ffffff",
                          fontSize: 12,
                        }}
                        formatter={(value: number | string) => [`${Number(value).toFixed(1)} 分`, "健康得分"]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="pt-3 border-t border-[rgba(32,27,72,0.09)] grid grid-cols-3 text-center">
                  <div>
                    <div className="text-[11.5px] text-[#9a9ab0]">综合评分</div>
                    <div className="text-[13.5px] font-semibold text-[#6c5ce7]">{radarData.score}分</div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-[#9a9ab0]">最佳指标</div>
                    <div className="text-[13.5px] font-semibold text-[#5a5a75] truncate">{radarData.best}</div>
                  </div>
                  <div>
                    <div className="text-[11.5px] text-[#9a9ab0]">待改善</div>
                    <div className="text-[13.5px] font-semibold text-[#5a5a75] truncate">{radarData.worst}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
