import { useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Checkbox } from "@/app/components/ui/checkbox";
import { cn } from "@/app/components/ui/utils";
import type { IndicatorCategory } from "@/app/components/AddRecordDialog";
import { Check, ChevronDown, CloudDownload, Download, FileText, Folder, Info, X } from "lucide-react";

interface ExportDialogProps {
  categories: IndicatorCategory[];
  onExport: (indicatorIds: string[] | null, format: "xlsx" | "csv", onProgress?: (value: number) => void) => void;
  triggerClassName?: string;
  triggerLabel?: string;
}

export function ExportDialog({ categories, onExport, triggerClassName, triggerLabel }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const allCategoryIds = categories.map(c => c.id);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() => allCategoryIds);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [exportAll, setExportAll] = useState(true);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");

  const toggleCategory = (id: string, checked: boolean | "indeterminate") => {
    const isChecked = checked === true;
    setExportAll(false);
    setSelectedCategoryIds(prev => {
      if (isChecked) {
        if (prev.includes(id)) {
          return prev;
        }
        return [...prev, id];
      }
      return prev.filter(item => item !== id);
    });
  };

  const handleToggleAll = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      setExportAll(true);
      setSelectedCategoryIds(allCategoryIds);
    } else {
      setExportAll(false);
      setSelectedCategoryIds([]);
    }
  };

  const handleConfirm = () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    setProgress(0);
    setStatus("running");
    const idsToExport = exportAll
      ? null
      : categories
          .filter(category => selectedCategoryIds.includes(category.id))
          .flatMap(category => category.items.map((item: { id: string }) => item.id));
    try {
      onExport(idsToExport, format, value => {
        setProgress(value);
      });
      setStatus("done");
    } finally {
      setExporting(false);
      setTimeout(() => {
        setStatus("idle");
        setOpen(false);
      }, 800);
    }
  };

  const summaryLabel = exportAll
    ? "全部导出"
    : selectedCategoryIds.length === 0
      ? "未选择分类"
      : `已选 ${selectedCategoryIds.length} 个分类`;

  const canConfirm = exportAll || selectedCategoryIds.length > 0;

  const formatOptions: Array<{
    value: "xlsx" | "csv";
    name: string;
    sub: string;
    icon: ReactNode;
  }> = [
    {
      value: "xlsx",
      name: "Excel",
      sub: "电子表格 .xlsx",
      icon: (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#35c759] to-[#1d9d53] shadow-[0_4px_10px_rgba(29,157,83,0.38),inset_0_1px_0_rgba(255,255,255,0.28)]">
          <X className="h-5 w-5 text-white" strokeWidth={3.2} />
        </span>
      ),
    },
    {
      value: "csv",
      name: "CSV",
      sub: "纯文本 .csv",
      icon: (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#efedfd] text-[#6c5ce7]">
          <FileText className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </span>
      ),
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setStatus("idle");
          setExporting(false);
          setSelectorOpen(false);
          setExportAll(true);
          setSelectedCategoryIds(allCategoryIds);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn("gap-2", triggerClassName)}
        >
          <Download className="w-4 h-4" />
          {triggerLabel ?? "导出Excel"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#8a79ff] via-[#6c5ce7] to-[#4f7df9] text-white shadow-[0_8px_18px_-4px_rgba(108,92,231,0.5),inset_0_1px_0_rgba(255,255,255,0.28)]">
              <CloudDownload className="h-[22px] w-[22px]" strokeWidth={1.9} />
            </span>
            <DialogTitle className="text-xl">
              数据导出
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <span className="text-[13px] font-semibold text-[#5a5a75]">导出范围</span>
            <div className="relative">
              <button
                type="button"
                className="flex h-11 w-full items-center justify-between gap-2.5 rounded-[12px] border border-[rgba(32,27,72,0.05)] bg-[#f4f4f9] pl-3 pr-2.5 transition hover:bg-[#efeff6] hover:border-[rgba(108,92,231,0.18)]"
                onClick={() => {
                  console.log("[ExportDialog] range button clicked");
                  setSelectorOpen(prev => {
                    const next = !prev;
                    console.log("[ExportDialog] selectorOpen change:", next);
                    return next;
                  });
                }}
              >
                <span className="inline-flex min-w-0 items-center gap-[9px]">
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#efedfd] text-[#6c5ce7]">
                    <Folder className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <span className="truncate text-[13.5px] font-semibold text-[#20203a]">{summaryLabel}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-[7px]">
                  <span className="text-xs text-[#5a5a75]">点击选择指标</span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(108,92,231,0.12)] text-[#6c5ce7]">
                    <ChevronDown className="h-[13px] w-[13px]" strokeWidth={2.4} />
                  </span>
                </span>
              </button>
              {selectorOpen && (
                <div className="absolute left-0 right-0 mt-2 rounded-[16px] border border-[rgba(108,92,231,0.14)] bg-white p-[7px] shadow-[0_22px_48px_-14px_rgba(76,59,165,0.24),0_6px_16px_-8px_rgba(76,59,165,0.12)] z-[60]">
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition hover:bg-[#f2effe]">
                    <Checkbox
                      checked={exportAll}
                      onCheckedChange={handleToggleAll}
                    />
                    <span className="text-[13.5px] font-semibold text-[#20203a]">全部导出</span>
                  </label>
                  <div className="mx-[9px] my-[5px] h-px bg-[rgba(32,27,72,0.09)]" />
                  <div className="max-h-48 overflow-y-auto">
                    {categories.map(category => (
                      <label
                        key={category.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition hover:bg-[#f2effe]"
                      >
                        <Checkbox
                          checked={
                            exportAll || selectedCategoryIds.includes(category.id)
                          }
                          onCheckedChange={(checked: boolean | "indeterminate") =>
                            toggleCategory(category.id, checked)
                          }
                        />
                        <span className="text-[13.5px] font-medium text-[#20203a]">{category.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-[2px] flex items-start gap-[7px] text-[11.5px] leading-[1.6] text-[#9a9ab0]">
              <span className="mt-[1px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full bg-[#efedfd] text-[#6c5ce7]">
                <Info className="h-3 w-3" strokeWidth={2.2} />
              </span>
              默认导出所有指标。若只需要部分指标，请在上方下拉中取消勾选。
            </p>
          </div>
          <div className="space-y-2">
            <span className="text-[13px] font-semibold text-[#5a5a75]">导出格式</span>
            <div className="grid grid-cols-2 gap-2.5">
              {formatOptions.map(option => {
                const isActive = format === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormat(option.value)}
                    className={cn(
                      "relative flex h-[68px] items-center gap-[11px] rounded-[15px] border-[1.5px] px-[14px] py-3 text-left transition active:scale-[0.985]",
                      isActive
                        ? "border-transparent bg-gradient-to-br from-[#8a79ff] via-[#6c5ce7] to-[#4f7df9] shadow-[0_12px_24px_-10px_rgba(108,92,231,0.6),inset_0_1px_0_rgba(255,255,255,0.22)]"
                        : "border-[rgba(108,92,231,0.28)] bg-white hover:border-[rgba(108,92,231,0.6)] hover:bg-[#faf9ff]",
                    )}
                  >
                    {option.icon}
                    <span className="flex min-w-0 flex-col gap-[2px]">
                      <span className={cn("text-sm font-semibold leading-[1.2]", isActive ? "text-white" : "text-[#20203a]")}>
                        {option.name}
                      </span>
                      <span className={cn("text-[11px] leading-[1.2]", isActive ? "text-white/75" : "text-[#9a9ab0]")}>
                        {option.sub}
                      </span>
                    </span>
                    {isActive && (
                      <span className="absolute right-[9px] top-[9px] flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white shadow-[0_2px_6px_rgba(40,20,90,0.28)]">
                        <Check className="h-[11px] w-[11px] text-[#6c5ce7]" strokeWidth={3.2} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-[#9a9ab0]">
            <span>
              当前共 {categories.length} 个检验指标分类。
            </span>
            {status === "running" && (
              <span className="text-[#6c5ce7]">
                正在导出{progress > 0 ? `（${progress}%）` : "，请稍候..."}
              </span>
            )}
            {status === "done" && (
              <span className="inline-flex h-[26px] items-center gap-[5px] rounded-full bg-[#e8f7f1] px-[11px] text-xs font-semibold text-[#0f9d6e] shadow-[inset_0_0_0_1px_rgba(15,157,110,0.14)]">
                <Check className="h-[13px] w-[13px]" strokeWidth={2.4} />
                导出完成
              </span>
            )}
          </div>
          <div className="flex justify-end gap-2.5 pt-[2px]">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-10 rounded-full border-0 bg-[#f1f1f7] px-5 text-[#4c4c66] hover:bg-[#e8e8f2] hover:text-[#4c4c66]"
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={!canConfirm || exporting}
              onClick={handleConfirm}
              className="h-10 rounded-full px-5"
            >
              <Download className="h-[14px] w-[14px]" strokeWidth={2.2} />
              {exporting ? "导出中..." : "开始导出"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
