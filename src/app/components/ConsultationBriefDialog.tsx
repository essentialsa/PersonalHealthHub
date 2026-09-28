import { useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { cn } from "@/app/components/ui/utils";
import { Calendar, ClipboardList, Clock, Copy, Download, FileText, FlaskConical, Info, PanelTop, Printer, Sparkles } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import type { HealthRecord, IndicatorCategory, IndicatorItem } from "@/app/components/AddRecordDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SelectionMode = "single" | "multiple";

interface ConsultationBriefDialogProps {
  categories: IndicatorCategory[];
  records: HealthRecord[];
  triggerClassName?: string;
}

type NumericRange = {
  min: number;
  max: number;
};

type PivotCell = {
  value: string;
  abnormal: boolean;
};

type PivotIndicator = {
  name: string;
  unit: string;
  referenceRange: string;
};

type PivotTable = {
  categoryId: string;
  categoryName: string;
  indicators: PivotIndicator[];
  dates: string[];
  rows: (PivotCell | null)[][];
};

type AbnormalItem = {
  categoryName: string;
  indicatorName: string;
  value: string;
  unit: string;
  status: string;
  date: string;
};

type ConsultationReport = {
  title: string;
  generatedAt: string;
  dateRange: string;
  firstDate: string;
  lastDate: string;
  categoryNames: string[];
  recordCount: number;
  indicatorCount: number;
  abnormalCount: number;
  pivotTables: PivotTable[];
  abnormalItems: AbnormalItem[];
  questions: string[];
};

// ---------------------------------------------------------------------------
// Utility helpers (preserved)
// ---------------------------------------------------------------------------

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2);
};

const parseNumericRange = (text?: string): NumericRange | null => {
  if (!text) {
    return null;
  }
  const match = text.trim().match(/(-?\d+(?:\.\d+)?)\s*[-~—–]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
};

const describeRangeStatus = (item: IndicatorItem, latestValue: number) => {
  const range = parseNumericRange(item.referenceRange);
  if (!range) {
    return null;
  }
  if (latestValue > range.max) {
    return `高于参考范围(${item.referenceRange})`;
  }
  if (latestValue < range.min) {
    return `低于参考范围(${item.referenceRange})`;
  }
  return `处于参考范围(${item.referenceRange})`;
};

// ---------------------------------------------------------------------------
// HTML escape helper
// ---------------------------------------------------------------------------

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

const questionLines = [
  "近 2 周是否出现乏力、头晕、胸闷、睡眠变化等不适，出现时间与指标波动是否一致？",
  "近期饮食结构、饮酒、运动频率、体重变化与既往相比有什么明显改变？",
  "当前是否正在服用影响相关指标的药物或保健品，是否需要调整用药或复查周期？",
];

const buildConsultationReport = ({
  selectedCategories,
  records,
  dateFrom,
  dateTo,
}: {
  selectedCategories: IndicatorCategory[];
  records: HealthRecord[];
  dateFrom: string;
  dateTo: string;
}): ConsultationReport | null => {
  const selectedIndicatorIds = selectedCategories.flatMap(category => category.items.map(item => item.id));

  let scopedRecords = records.filter(record => selectedIndicatorIds.includes(record.indicatorType));

  if (dateFrom) {
    scopedRecords = scopedRecords.filter(record => record.date >= dateFrom);
  }
  if (dateTo) {
    scopedRecords = scopedRecords.filter(record => record.date <= dateTo);
  }

  if (scopedRecords.length === 0) {
    return null;
  }

  scopedRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const firstDate = scopedRecords[0].date;
  const lastDate = scopedRecords[scopedRecords.length - 1].date;
  const generatedAt = new Date().toLocaleString("zh-CN");

  // Build indicator lookup
  const indicatorLookup = new Map<string, IndicatorItem>();
  selectedCategories.forEach(cat => {
    cat.items.forEach(item => {
      indicatorLookup.set(item.id, item);
    });
  });

  const seenIndicators = new Set<string>();
  scopedRecords.forEach(r => seenIndicators.add(r.indicatorType));
  const indicatorCount = seenIndicators.size;

  // Build one pivot table per category
  const pivotTables: PivotTable[] = [];
  const abnormalItems: AbnormalItem[] = [];
  const seenAbnormal = new Set<string>();

  selectedCategories.forEach(category => {
    const categoryItemIds = category.items.map(item => item.id);
    const categoryRecords = scopedRecords.filter(r => categoryItemIds.includes(r.indicatorType));
    if (categoryRecords.length === 0) return;

    // Determine which indicators and dates appear in this category
    const catDates = Array.from(new Set(categoryRecords.map(r => r.date))).sort();
    const catIndicatorIds = Array.from(
      new Set(categoryRecords.map(r => r.indicatorType)),
    );
    // Preserve category item order
    const orderedIndicators = category.items.filter(item => catIndicatorIds.includes(item.id));

    const indicators: PivotIndicator[] = orderedIndicators.map(item => ({
      name: item.label,
      unit: item.unit ?? "",
      referenceRange: item.referenceRange ?? "",
    }));

    // Build lookup: date -> indicatorId -> record
    const cellMap = new Map<string, Map<string, HealthRecord>>();
    categoryRecords.forEach(record => {
      if (!cellMap.has(record.date)) {
        cellMap.set(record.date, new Map());
      }
      cellMap.get(record.date)!.set(record.indicatorType, record);
    });

    // Build rows
    const rows: (PivotCell | null)[][] = catDates.map(date => {
      const dateCells = cellMap.get(date)!;
      return orderedIndicators.map(item => {
        const record = dateCells.get(item.id);
        if (!record) return null;
        const rangeStatus = describeRangeStatus(item, record.value);
        const abnormal = !!(rangeStatus && (rangeStatus.includes("高于") || rangeStatus.includes("低于")));

        if (abnormal) {
          const abKey = `${category.name}_${item.label}`;
          if (!seenAbnormal.has(abKey)) {
            seenAbnormal.add(abKey);
            abnormalItems.push({
              categoryName: category.name,
              indicatorName: item.label,
              value: formatNumber(record.value),
              unit: item.unit ?? "",
              status: rangeStatus!,
              date,
            });
          }
        }

        return { value: formatNumber(record.value), abnormal };
      });
    });

    pivotTables.push({
      categoryId: category.id,
      categoryName: category.name,
      indicators,
      dates: catDates,
      rows,
    });
  });

  const dateRangeLabel = dateFrom && dateTo
    ? `${dateFrom} ~ ${dateTo}`
    : dateFrom
      ? `${dateFrom} ~ 至今`
      : dateTo
        ? `起始 ~ ${dateTo}`
        : "全部";

  return {
    title: "个人健康档案问诊报告",
    generatedAt,
    dateRange: dateRangeLabel,
    firstDate,
    lastDate,
    categoryNames: selectedCategories.map(c => c.name),
    recordCount: scopedRecords.length,
    indicatorCount,
    abnormalCount: abnormalItems.length,
    pivotTables,
    abnormalItems,
    questions: [...questionLines],
  };
};

// ---------------------------------------------------------------------------
// Plain-text summary (for clipboard)
// ---------------------------------------------------------------------------

const buildReportPlainText = (report: ConsultationReport): string => {
  const lines: string[] = [];

  lines.push("【个人健康档案问诊报告】");
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push(`时间范围：${report.dateRange}`);
  lines.push(`实际周期：${report.firstDate} ~ ${report.lastDate}`);
  lines.push(`指标分类：${report.categoryNames.join("、")}`);
  lines.push(`数据条数：${report.recordCount}`);
  lines.push(`异常指标数：${report.abnormalCount}`);
  lines.push("");

  lines.push("【异常关注项】");
  if (report.abnormalItems.length > 0) {
    report.abnormalItems.forEach(item => {
      lines.push(`- ${item.categoryName} / ${item.indicatorName}：${item.status}，数值 ${item.value} ${item.unit}（${item.date}）`);
    });
  } else {
    lines.push("- 暂未发现超出参考范围的异常项，建议继续规律复查。");
  }
  lines.push("");

  report.pivotTables.forEach(table => {
    lines.push(`【${table.categoryName}】`);
    // Header
    const header = ["日期", ...table.indicators.map(ind => ind.name)];
    lines.push(header.join("\t"));
    // Rows
    table.dates.forEach((date, rowIdx) => {
      const cells = table.rows[rowIdx].map(cell => {
        if (!cell) return "-";
        const suffix = cell.abnormal ? "↑" : "";
        return `${cell.value}${suffix}`;
      });
      lines.push([date, ...cells].join("\t"));
    });
    lines.push("");
  });

  lines.push("【建议沟通重点】");
  report.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q}`);
  });

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// HTML report builder
// ---------------------------------------------------------------------------

const buildReportHtml = (report: ConsultationReport): string => {
  const pivotSections = report.pivotTables
    .map(table => {
      const headerCells = table.indicators
        .map(ind => {
          const unitPart = ind.unit ? ` <span class="unit-label">(${escapeHtml(ind.unit)})</span>` : "";
          const ref = ind.referenceRange ? `<br><small>${escapeHtml(ind.referenceRange)}</small>` : "";
          return `<th class="numeric">${escapeHtml(ind.name)}${unitPart}${ref}</th>`;
        })
        .join("");

      const bodyRows = table.dates
        .map((date, rowIdx) => {
          const cells = table.rows[rowIdx]
            .map(cell => {
              if (!cell) return '<td class="numeric">-</td>';
              const cls = cell.abnormal ? 'numeric abnormal' : 'numeric';
              return `<td class="${cls}">${escapeHtml(cell.value)}</td>`;
            })
            .join("");
          return `<tr><td>${escapeHtml(date)}</td>${cells}</tr>`;
        })
        .join("");

      return `
      <section class="pivot-section">
        <h3>${escapeHtml(table.categoryName)}</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>日期</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </section>`;
    })
    .join("");

  const abnormalHtml =
    report.abnormalItems.length > 0
      ? `<ul>${report.abnormalItems
          .map(
            item =>
              `<li>${escapeHtml(item.categoryName)} / ${escapeHtml(item.indicatorName)}：${escapeHtml(item.status)}，数值 ${escapeHtml(item.value)} ${escapeHtml(item.unit)}（${escapeHtml(item.date)}）</li>`,
          )
          .join("")}</ul>`
      : `<p>暂未发现超出参考范围的异常项，建议继续规律复查。</p>`;

  const questionsHtml = report.questions.map(q => `<li>${escapeHtml(q)}</li>`).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>个人健康档案问诊报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      background: #f5f5f5;
      color: #222;
      font-size: 14px;
      line-height: 1.6;
    }

    .report-page {
      width: 210mm;
      min-height: 297mm;
      margin: 24px auto;
      background: #fff;
      padding: 40px 48px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }

    .report-header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1.5px solid #222;
    }

    .report-header h1 {
      font-size: 22px;
      font-weight: 700;
      color: #111;
      margin-bottom: 4px;
    }

    .report-header .subtitle {
      font-size: 13px;
      color: #888;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 24px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #444;
    }

    .info-grid dt { color: #888; }
    .info-grid dd { font-weight: 500; }

    .summary-box {
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 6px;
      padding: 14px 18px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #555;
    }

    .summary-box p { margin-bottom: 4px; }
    .summary-box p:last-child { margin-bottom: 0; }
    .summary-box strong { color: #222; }

    .abnormal-section {
      margin-bottom: 20px;
    }

    .abnormal-section h2 {
      font-size: 15px;
      font-weight: 600;
      color: #222;
      margin-bottom: 8px;
    }

    .abnormal-section ul {
      list-style: disc;
      padding-left: 20px;
      font-size: 13px;
      color: #555;
    }

    .abnormal-section li {
      margin-bottom: 4px;
    }

    .pivot-section {
      margin-bottom: 24px;
      page-break-inside: avoid;
    }

    .pivot-section h3 {
      font-size: 16px;
      font-weight: 700;
      color: #111;
      text-align: center;
      margin-bottom: 8px;
    }

    .report-table {
      width: 100%;
      border-collapse: collapse;
      border-top: 2px solid #111;
      border-bottom: 2px solid #111;
      margin-top: 8px;
      font-size: 13px;
    }

    .report-table thead {
      border-bottom: 1.5px solid #111;
    }

    .report-table th,
    .report-table td {
      border: none;
      padding: 8px 10px;
      text-align: center;
      font-weight: inherit;
    }

    .report-table th {
      font-weight: 700;
    }

    .report-table .unit-label {
      font-weight: 700;
      color: inherit;
    }

    .report-table .numeric {
      font-variant-numeric: tabular-nums;
    }

    .report-table .abnormal {
      color: #b91c1c;
    }

    .questions-section {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
    }

    .questions-section h2 {
      font-size: 15px;
      font-weight: 600;
      color: #222;
      margin-bottom: 8px;
    }

    .questions-section ol {
      padding-left: 20px;
      font-size: 13px;
      color: #444;
    }

    .questions-section li {
      margin-bottom: 6px;
    }

    .report-footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #999;
      text-align: center;
    }

    @page {
      size: A4;
      margin: 16mm;
    }

    @media print {
      body {
        background: #fff;
      }

      .report-page {
        width: auto;
        min-height: auto;
        box-shadow: none;
        padding: 0;
      }

      .pivot-section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="report-page">
    <div class="report-header">
      <h1>${escapeHtml(report.title)}</h1>
      <div class="subtitle">Personal Health Consultation Report</div>
    </div>

    <dl class="info-grid">
      <dt>生成时间</dt>
      <dd>${escapeHtml(report.generatedAt)}</dd>
      <dt>时间范围</dt>
      <dd>${escapeHtml(report.dateRange)}</dd>
      <dt>指标分类</dt>
      <dd>${escapeHtml(report.categoryNames.join("、"))}</dd>
      <dt>数据条数</dt>
      <dd>${report.recordCount}</dd>
    </dl>

    <div class="summary-box">
      <p>纳入指标数：<strong>${report.indicatorCount}</strong></p>
      <p>异常指标数：<strong>${report.abnormalCount}</strong></p>
      <p>实际周期：<strong>${escapeHtml(report.firstDate)} ~ ${escapeHtml(report.lastDate)}</strong></p>
      <p>本报告基于用户录入或导入的健康指标数据自动整理，仅用于问诊沟通辅助，不替代医生诊断。</p>
    </div>

    <div class="abnormal-section">
      <h2>异常关注项</h2>
      ${abnormalHtml}
    </div>

    ${pivotSections}

    <div class="questions-section">
      <h2>建议沟通重点</h2>
      <ol>${questionsHtml}</ol>
    </div>

    <div class="report-footer">
      本报告由 PersonalHealthHub 自动生成 &mdash; ${escapeHtml(report.generatedAt)}
    </div>
  </div>
</body>
</html>`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConsultationBriefDialog({ categories, records, triggerClassName }: ConsultationBriefDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("multiple");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState<ConsultationReport | null>(null);
  const [plainText, setPlainText] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const categoriesWithData = useMemo(() => {
    return categories.filter(category =>
      category.items.some(item => records.some(record => record.indicatorType === item.id)),
    );
  }, [categories, records]);

  const selectedCategories = useMemo(() => {
    return categoriesWithData.filter(category => selectedCategoryIds.includes(category.id));
  }, [categoriesWithData, selectedCategoryIds]);

  const resetDialog = () => {
    setSelectionMode("multiple");
    setSelectedCategoryIds([]);
    setDateFrom("");
    setDateTo("");
    setReport(null);
    setPlainText("");
    setMessage("");
    setCopied(false);
  };

  const toggleCategory = (categoryId: string, checked: boolean) => {
    if (selectionMode === "single") {
      setSelectedCategoryIds(checked ? [categoryId] : []);
      return;
    }
    setSelectedCategoryIds(prev => {
      if (checked) {
        if (prev.includes(categoryId)) {
          return prev;
        }
        return [...prev, categoryId];
      }
      return prev.filter(id => id !== categoryId);
    });
  };

  const applySelectionMode = (mode: SelectionMode) => {
    setSelectionMode(mode);
    if (mode === "single" && selectedCategoryIds.length > 1) {
      setSelectedCategoryIds([selectedCategoryIds[0]]);
    }
  };

  const handleGenerateReport = () => {
    if (selectedCategories.length === 0) {
      setMessage("请先选择至少一个检验指标种类。");
      setReport(null);
      setPlainText("");
      return;
    }

    const nextReport = buildConsultationReport({
      selectedCategories,
      records,
      dateFrom,
      dateTo,
    });

    if (!nextReport) {
      setMessage("当前所选指标种类暂无可用数据，请先导入或录入检验记录。");
      setReport(null);
      setPlainText("");
      return;
    }

    setReport(nextReport);
    setPlainText(buildReportPlainText(nextReport));
    setMessage("");
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!plainText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadHtml = () => {
    if (!report) {
      return;
    }
    const html = buildReportHtml(report);
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `个人健康档案问诊报告_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!report) {
      return;
    }
    const html = buildReportHtml(report);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetDialog();
          return;
        }
        if (categoriesWithData.length > 0) {
          setSelectedCategoryIds([categoriesWithData[0].id]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className={cn("gap-2", triggerClassName)}>
          <ClipboardList className="w-4 h-4" />
          问诊简报
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[880px] max-h-[880px] gap-0 overflow-y-auto p-0">
        <DialogHeader className="flex-row items-start gap-4 px-[30px] pt-[30px] text-left">
          <div
            aria-hidden="true"
            className="flex size-[52px] shrink-0 items-center justify-center rounded-[15px] bg-[linear-gradient(140deg,#6c5ce7_0%,#7c6ef0_45%,#06b6d4_100%)] shadow-[0_10px_22px_rgba(108,92,231,0.38),inset_0_1px_0_rgba(255,255,255,0.35)]"
          >
            <Sparkles className="size-[26px] text-white" />
          </div>
          <div className="min-w-0 pt-0.5">
            <DialogTitle className="bg-gradient-to-r from-[#6c5ce7] via-[#5b54e0] to-[#3b6fe8] text-2xl leading-[1.25] tracking-[-0.018em]">
              问诊简报生成
            </DialogTitle>
            <p className="mt-[5px] text-[13.5px] leading-normal text-[#9a9ab8]">
              AI 辅助整理健康数据，生成可用于问诊沟通的档案报告
            </p>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 px-[30px] pb-7 pt-[22px]">
          <section className="relative overflow-hidden rounded-[18px] border border-[rgba(108,92,231,0.12)] bg-[linear-gradient(110deg,#f5f3ff_0%,#eef2ff_100%)] py-4 pl-[22px] pr-[18px] before:absolute before:bottom-[14px] before:left-0 before:top-[14px] before:w-1 before:rounded-r before:bg-gradient-to-b before:from-[#6c5ce7] before:to-[#8b7ff0] before:content-['']">
            <h3 className="mb-[11px] flex items-center gap-[7px] text-sm font-semibold leading-[1.4] text-[#5448c8]">
              <PanelTop className="size-[15px] text-[#6c5ce7]" aria-hidden="true" />
              选择模式
            </h3>
            <div className="flex items-center justify-between gap-3.5">
              <div
                role="group"
                aria-label="选择模式"
                className="inline-flex h-[38px] items-center gap-[3px] rounded-[11px] bg-[rgba(108,92,231,0.12)] p-[3px] shadow-[inset_0_1px_2px_rgba(76,62,170,0.12)]"
              >
                <button
                  type="button"
                  onClick={() => applySelectionMode("single")}
                  className={cn(
                    "inline-flex h-8 items-center rounded-[8px] px-6 text-[13.5px] font-medium transition-all",
                    selectionMode === "single"
                      ? "bg-white font-semibold text-[#5a49d6] shadow-[0_2px_6px_rgba(76,62,170,0.18),0_1px_2px_rgba(76,62,170,0.10)]"
                      : "text-[#6b6494] hover:text-[#4f46a5]",
                  )}
                >
                  单选
                </button>
                <button
                  type="button"
                  onClick={() => applySelectionMode("multiple")}
                  className={cn(
                    "inline-flex h-8 items-center rounded-[8px] px-6 text-[13.5px] font-medium transition-all",
                    selectionMode === "multiple"
                      ? "bg-white font-semibold text-[#5a49d6] shadow-[0_2px_6px_rgba(76,62,170,0.18),0_1px_2px_rgba(76,62,170,0.10)]"
                      : "text-[#6b6494] hover:text-[#4f46a5]",
                  )}
                >
                  多选
                </button>
              </div>
              <span className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-[rgba(108,92,231,0.18)] bg-white/75 px-3.5 text-[12.5px] font-semibold text-[#6c5ce7]">
                <Clock className="size-[13px]" aria-hidden="true" />
                {selectionMode === "single" ? "单个分类深度问诊" : "多个分类综合问诊"}
              </span>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[18px] border-[1.2px] border-[rgba(108,92,231,0.22)] bg-white py-4 pl-[22px] pr-[18px] shadow-[0_2px_10px_rgba(108,92,231,0.05)] before:absolute before:bottom-[14px] before:left-0 before:top-[14px] before:w-1 before:rounded-r before:bg-gradient-to-b before:from-[#6c5ce7] before:to-[#a78bfa] before:content-['']">
            <h3 className="mb-[11px] flex items-center gap-[7px] text-sm font-semibold leading-[1.4] text-[#20203a]">
              <FlaskConical className="size-[15px] text-[#6c5ce7]" aria-hidden="true" />
              检验指标种类
            </h3>
            {categoriesWithData.length === 0 ? (
              <div className="text-[13.5px] text-[#9a9ab0]">暂无可用数据，请先录入或导入体检记录。</div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {categoriesWithData.map(category => {
                  const checked = selectedCategoryIds.includes(category.id);
                  return (
                    <label
                      key={category.id}
                      className={cn(
                        "flex h-[42px] cursor-pointer items-center gap-[9px] rounded-[12px] border px-3.5 text-sm font-semibold transition-all",
                        checked
                          ? "border-transparent bg-gradient-to-br from-[#6c5ce7] via-[#7c6ef0] to-[#8b5cf6] text-white shadow-[0_6px_14px_rgba(108,92,231,0.32),inset_0_1px_0_rgba(255,255,255,0.28)]"
                          : "border-[rgba(108,92,231,0.12)] bg-[#f4f2ff] text-[#4b4574] hover:border-[rgba(108,92,231,0.28)] hover:bg-[#ece9ff]",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={value => toggleCategory(category.id, value === true)}
                        className="size-[18px] rounded-[6px] border-[1.5px] border-[rgba(108,92,231,0.35)] bg-white/70 shadow-none data-[state=checked]:border-white/75 data-[state=checked]:bg-white/20 data-[state=checked]:bg-none data-[state=checked]:text-white"
                      />
                      <span className="truncate">{category.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className="relative overflow-hidden rounded-[18px] border border-[rgba(6,182,212,0.16)] bg-[linear-gradient(110deg,#f0f9ff_0%,#ecfeff_100%)] py-4 pl-[22px] pr-[18px] before:absolute before:bottom-[14px] before:left-0 before:top-[14px] before:w-1 before:rounded-r before:bg-gradient-to-b before:from-[#0ea5e9] before:to-[#06b6d4] before:content-['']">
            <h3 className="mb-[11px] flex items-center gap-[7px] text-sm font-semibold leading-[1.4] text-[#0e6e84]">
              <Calendar className="size-[15px] text-[#0891b2]" aria-hidden="true" />
              时间范围（可选）
            </h3>
            <div className="flex flex-wrap items-center gap-[9px]">
              <Label htmlFor="consult-date-from" className="text-[13.5px] font-semibold text-[#3f6f80]">从</Label>
              <Input
                id="consult-date-from"
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-[38px] w-[162px] rounded-[11px] border-[rgba(8,145,178,0.20)] bg-white/75 text-[13px] text-[#23495a] shadow-[inset_0_1px_1px_rgba(8,145,178,0.05)] focus-visible:border-[#06b6d4] focus-visible:bg-white focus-visible:ring-[rgba(6,182,212,0.18)] focus-visible:ring-[3px]"
              />
              <Label htmlFor="consult-date-to" className="text-[13.5px] font-semibold text-[#3f6f80]">至</Label>
              <Input
                id="consult-date-to"
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-[38px] w-[162px] rounded-[11px] border-[rgba(8,145,178,0.20)] bg-white/75 text-[13px] text-[#23495a] shadow-[inset_0_1px_1px_rgba(8,145,178,0.05)] focus-visible:border-[#06b6d4] focus-visible:bg-white focus-visible:ring-[rgba(6,182,212,0.18)] focus-visible:ring-[3px]"
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  className="h-8 rounded-lg px-2.5 text-[13px] font-semibold text-[#8aa6b2] underline decoration-[rgba(8,145,178,0.35)] underline-offset-[3px] transition-colors hover:bg-[rgba(8,145,178,0.07)] hover:text-[#0e7490]"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                >
                  清除
                </button>
              )}
            </div>
            <p className="mt-[9px] flex items-center gap-1.5 text-[12.5px] text-[#7aa2b0]">
              <Info className="size-[13px]" aria-hidden="true" />
              不选择则导出全部数据
            </p>
          </section>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              onClick={handleGenerateReport}
              disabled={categoriesWithData.length === 0}
              className="h-11 rounded-full px-6 text-sm font-semibold"
            >
              <Sparkles className="size-[17px] text-[#fde68a]" />
              生成报告
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopy}
              disabled={!plainText}
              className="h-11 flex-1 rounded-full border-[1.2px] border-[rgba(108,92,231,0.35)] bg-white/90 text-sm font-semibold text-[#5a49d6] hover:border-[rgba(108,92,231,0.55)] hover:bg-[#f6f5ff] hover:text-[#5a49d6] hover:shadow-[0_6px_14px_rgba(108,92,231,0.12)] [&_svg]:text-[#6c5ce7]"
            >
              <Copy className="size-[17px]" />
              {copied ? "已复制" : "复制摘要"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadHtml}
              disabled={!report}
              className="h-11 flex-1 rounded-full border-[1.2px] border-[rgba(108,92,231,0.35)] bg-white/90 text-sm font-semibold text-[#5a49d6] hover:border-[rgba(108,92,231,0.55)] hover:bg-[#f6f5ff] hover:text-[#5a49d6] hover:shadow-[0_6px_14px_rgba(108,92,231,0.12)] [&_svg]:text-[#6c5ce7]"
            >
              <Download className="size-[17px]" />
              下载 HTML
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handlePrint}
              disabled={!report}
              className="h-11 flex-1 rounded-full border-[1.2px] border-[rgba(108,92,231,0.35)] bg-white/90 text-sm font-semibold text-[#5a49d6] hover:border-[rgba(108,92,231,0.55)] hover:bg-[#f6f5ff] hover:text-[#5a49d6] hover:shadow-[0_6px_14px_rgba(108,92,231,0.12)] [&_svg]:text-[#6c5ce7]"
            >
              <Printer className="size-[17px]" />
              打印 / 导出 PDF
            </Button>
          </div>

          <section className="mt-0.5">
            <h3 className="mb-2.5 flex items-center gap-[7px] text-sm font-semibold text-[#20203a]">
              <FileText className="size-[15px] text-[#6c5ce7]" aria-hidden="true" />
              报告预览
            </h3>

            {!report && (
              <div className="relative flex h-[200px] flex-col items-center justify-center gap-3 overflow-hidden rounded-[18px] border-[1.5px] border-dashed border-[rgba(108,92,231,0.28)] bg-[#fbfaff] text-center">
                <div className="flex size-[68px] items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#ece9ff_70%,#e2ddff_100%)] shadow-[0_10px_26px_rgba(108,92,231,0.20),inset_0_0_0_1px_rgba(108,92,231,0.10)]">
                  <FileText className="size-[30px] text-[#6c5ce7]" />
                </div>
                <p className="max-w-[380px] text-[13.5px] leading-relaxed text-[#9a9ab8]">
                  <strong className="mb-[3px] block text-[14.5px] font-semibold text-[#7a739c]">暂无报告内容</strong>
                {message || "点击“生成报告”后在此查看档案式问诊报告"}
                </p>
              </div>
            )}

            {report && (
              <div className="relative overflow-hidden rounded-[18px] border-[1.2px] border-[rgba(108,92,231,0.22)] bg-white py-4 pl-[22px] pr-[18px] shadow-[0_2px_10px_rgba(108,92,231,0.05)] before:absolute before:bottom-[14px] before:left-0 before:top-[14px] before:w-1 before:rounded-r before:bg-gradient-to-b before:from-[#6c5ce7] before:to-[#a78bfa] before:content-['']">
                <div className="mx-auto max-w-[760px] bg-white px-8 py-8 text-gray-900 shadow-sm">
                  {/* Title */}
                  <div className="text-center pb-4 mb-4 border-b border-gray-300">
                    <h2 className="text-xl font-bold text-gray-900">{report.title}</h2>
                    <p className="text-xs text-gray-400 mt-1">Personal Health Consultation Report</p>
                  </div>

                  {/* Basic info */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
                    <div>
                      <span className="text-gray-400">生成时间：</span>
                      <span className="font-medium">{report.generatedAt}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">时间范围：</span>
                      <span className="font-medium">{report.dateRange}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">指标分类：</span>
                      <span className="font-medium">{report.categoryNames.join("、")}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">数据条数：</span>
                      <span className="font-medium">{report.recordCount}</span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="rounded-md bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600 mb-4">
                    <p>
                      纳入指标数：<strong className="text-gray-900">{report.indicatorCount}</strong>
                    </p>
                    <p>
                      异常指标数：<strong className="text-gray-900">{report.abnormalCount}</strong>
                    </p>
                    <p>
                      实际周期：<strong className="text-gray-900">{report.firstDate} ~ {report.lastDate}</strong>
                    </p>
                    <p className="mt-1 text-gray-400 text-xs">
                      本报告基于用户录入或导入的健康指标数据自动整理，仅用于问诊沟通辅助，不替代医生诊断。
                    </p>
                  </div>

                  {/* Abnormal items */}
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">异常关注项</h3>
                    {report.abnormalItems.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                        {report.abnormalItems.map((item, idx) => (
                          <li key={idx}>
                            {item.categoryName} / {item.indicatorName}：{item.status}，数值 {item.value} {item.unit}（{item.date}）
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">暂未发现超出参考范围的异常项，建议继续规律复查。</p>
                    )}
                  </div>

                  {/* Pivot tables */}
                  {report.pivotTables.map(table => (
                    <section key={table.categoryId} className="mt-8">
                      <h3 className="text-lg font-bold text-gray-900 text-center mb-2">{table.categoryName}</h3>

                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full border-collapse border-t-2 border-b-2 border-gray-900 text-sm">
                          <thead className="border-b border-gray-900">
                            <tr>
                              <th className="py-2 px-3 text-center font-bold whitespace-nowrap">日期</th>
                              {table.indicators.map(ind => (
                                <th key={ind.name} className="py-2 px-3 text-center font-bold whitespace-nowrap">
                                  {ind.name}
                                  {ind.unit && <span className="font-bold"> ({ind.unit})</span>}
                                  {ind.referenceRange && <span className="block text-xs font-normal text-gray-400">{ind.referenceRange}</span>}
                                </th>
                              ))}
                            </tr>
                          </thead>

                          <tbody>
                            {table.dates.map((date, rowIdx) => (
                              <tr key={date}>
                                <td className="py-2 px-3 text-center whitespace-nowrap">{date}</td>
                                {table.rows[rowIdx].map((cell, colIdx) => (
                                  <td
                                    key={colIdx}
                                    className={cn(
                                      "py-2 px-3 text-center tabular-nums",
                                      cell?.abnormal ? "text-red-700 font-medium" : "text-gray-700",
                                    )}
                                  >
                                    {cell?.value ?? "-"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}

                  {/* Questions */}
                  <div className="mt-8 pt-4 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">建议沟通重点</h3>
                    <ol className="list-decimal pl-5 text-sm text-gray-600 space-y-1.5">
                      {report.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
