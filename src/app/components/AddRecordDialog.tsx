import type React from "react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/app/components/ui/collapsible";
import { cn } from "@/app/components/ui/utils";
import { Plus, Paperclip, ClipboardPlus, Calendar, ChevronDown } from "lucide-react";
import { FileUploadZone } from "./FileUploadZone";
import type { HealthAttachment } from "@/app/services/attachment";

export interface IndicatorItem {
  id: string;
  label: string;
  unit: string;
  code?: string;
  referenceRange?: string;
  aliases?: string[];
  dataType?: "number" | "text" | "boolean";
  enabled?: boolean;
  order?: number;
}

export interface IndicatorCategory {
  id: string;
  name: string;
  code?: string;
  enabled?: boolean;
  order?: number;
  items: IndicatorItem[];
}

export interface HealthRecord {
  id: string;
  date: string;
  indicatorType: string;
  value: number;
  unit: string;
  operationAt?: string;
  attachmentId?: string;
  /** 报告原始异常标记：H=偏高/↑，L=偏低/↓ */
  abnormalFlag?: "H" | "L";
}

interface AddRecordDialogProps {
  onAddRecord: (record: HealthRecord) => void;
  onAddAttachment?: (attachment: HealthAttachment) => boolean;
  indicatorCategories: IndicatorCategory[];
  triggerClassName?: string;
}

/** 复合双值组（如血压：收缩压/舒张压）判断 */
const isCompoundPair = (items: IndicatorItem[]) =>
  items.length === 2 &&
  items.some((item) => item.label.includes("收缩压")) &&
  items.some((item) => item.label.includes("舒张压"));

/** 将「收缩压 (高压)」拆为主名与括号副名 */
const splitIndicatorLabel = (label: string): { name: string; sub: string } => {
  const match = label.match(/^(.*?)\s*([（(].*[）)])$/);
  return match ? { name: match[1], sub: match[2] } : { name: label, sub: "" };
};

const fieldLabelClass = "text-xs font-semibold tracking-[0.01em] text-[#8a8aa3]";
const controlClass = "h-11 rounded-xl";

export function AddRecordDialog({ onAddRecord, onAddAttachment, indicatorCategories, triggerClassName }: AddRecordDialogProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCategoryId || !date) {
      return;
    }

    const category = indicatorCategories.find(c => c.id === selectedCategoryId);
    if (!category) {
      return;
    }

    const activeItems = category.items.filter(item => {
      const v = values[item.id];
      return v !== undefined && v !== "";
    });

    if (activeItems.length === 0) {
      return;
    }

    let attachmentId: string | undefined;

    // 创建附件并关联到记录
    if (attachmentFile && attachmentDataUrl && onAddAttachment) {
      const newAttachmentId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const attachment: HealthAttachment = {
        id: newAttachmentId,
        fileName: attachmentFile.name,
        fileType: attachmentFile.type,
        fileSize: attachmentFile.size,
        data: attachmentDataUrl,
        date,
        createdAt: new Date().toISOString(),
      };
      if (onAddAttachment(attachment)) {
        attachmentId = newAttachmentId;
      }
    }

    activeItems.forEach(item => {
      const raw = values[item.id];
      const parsed = parseFloat(raw);
      if (Number.isNaN(parsed)) {
        return;
      }

      const newRecord: HealthRecord = {
        id: `${Date.now()}_${item.id}_${Math.random().toString(36).slice(2, 8)}`,
        date,
        indicatorType: item.id,
        value: parsed,
        unit: item.unit,
        operationAt: new Date().toISOString(),
        attachmentId,
      };

      onAddRecord(newRecord);
    });

    setValues({});
    setSelectedCategoryId("");
    setAttachmentFile(null);
    setAttachmentDataUrl("");
    setOpen(false);
  };

  const selectedCategory = indicatorCategories.find(c => c.id === selectedCategoryId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={cn("gap-2", triggerClassName)}>
          <Plus className="w-4 h-4" />
          添加检验记录
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-5 p-[22px_28px_20px] sm:max-w-[440px]">
        <DialogHeader className="flex-row items-center gap-[13px] pr-8">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#9b7bff_0%,#6c5ce7_52%,#3b82f6_100%)] text-white shadow-[0_8px_18px_rgba(108,92,231,0.42),inset_0_1px_0_rgba(255,255,255,0.35)]">
            <ClipboardPlus className="size-[22px]" strokeWidth={2} />
          </div>
          <DialogTitle className="text-[20px] font-bold leading-[1.25] tracking-[-0.02em]">
            添加体检记录
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[7px]">
            <Label htmlFor="date" className={fieldLabelClass}>数据日期</Label>
            <div className="relative">
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className={cn(controlClass, "pr-11 [&::-webkit-calendar-picker-indicator]:opacity-0")}
              />
              <Calendar className="pointer-events-none absolute right-[13px] top-1/2 size-[18px] -translate-y-1/2 text-[#6c5ce7]" />
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            <Label htmlFor="indicator" className={fieldLabelClass}>检验指标</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={(value) => {
                setSelectedCategoryId(value);
                setValues({});
              }}
              required
            >
              <SelectTrigger id="indicator" className={controlClass}>
                <SelectValue placeholder="选择检验指标" />
              </SelectTrigger>
              <SelectContent>
                {indicatorCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCategory && (
            isCompoundPair(selectedCategory.items) ? (
              <div className="rounded-[14px] border border-[rgba(108,92,231,0.10)] bg-[#f3f1fe] px-[14px] py-[2px]">
                {selectedCategory.items.map((item, index) => {
                  const { name, sub } = splitIndicatorLabel(item.label);
                  const isHigh = item.label.includes("收缩");
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "group relative flex h-[58px] items-center gap-[11px]",
                        index > 0 && "border-t border-[rgba(108,92,231,0.14)]",
                      )}
                    >
                      <span className="pointer-events-none absolute inset-y-[5px] -inset-x-[10px] rounded-[11px] bg-white opacity-0 shadow-[0_0_0_3px_rgba(108,92,231,0.15),0_4px_12px_rgba(108,92,231,0.10)] transition-opacity duration-150 group-focus-within:opacity-100" />
                      <span
                        className={cn(
                          "relative size-[9px] shrink-0 rounded-full",
                          isHigh
                            ? "bg-[#f0476a] shadow-[0_0_0_4px_rgba(240,71,106,0.15)]"
                            : "bg-[#3b82f6] shadow-[0_0_0_4px_rgba(59,130,246,0.15)]",
                        )}
                      />
                      <span className="relative whitespace-nowrap text-[13.5px] font-semibold text-[#20203a]">
                        {name}
                        {sub && <span className="ml-[3px] font-medium text-[#9a9ab0]">{sub}</span>}
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        value={values[item.id] ?? ""}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        placeholder="输入数值"
                        className="relative min-w-0 flex-1 border-none bg-transparent p-0 text-right text-[21px] font-bold tracking-[-0.01em] text-[#20203a] outline-none [appearance:textfield] placeholder:text-[13.5px] placeholder:font-normal placeholder:tracking-normal placeholder:text-[#a8a8c2] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="relative w-9 shrink-0 text-right text-xs font-semibold text-[#9a9ab0]">
                        {item.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-[14px]">
                {selectedCategory.items.map((item) => (
                  <div key={item.id} className="flex flex-col gap-[7px]">
                    <Label className={fieldLabelClass}>
                      {item.label} {item.unit && `(${item.unit})`}
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={values[item.id] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      placeholder="输入数值"
                      className={controlClass}
                    />
                  </div>
                ))}
              </div>
            )
          )}

          <Collapsible>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="group flex h-10 w-full items-center gap-[9px] rounded-full bg-[#f4f3f9] px-[15px] text-[13.5px] font-semibold text-[#5a5a75] transition-colors hover:bg-[#eceaf4]"
              >
                <Paperclip className="size-4 shrink-0 text-[#6c5ce7]" />
                附件（可选）
                <ChevronDown className="ml-auto size-[15px] text-[#b0b0c4] transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <FileUploadZone
                onFileSelect={(file, dataUrl) => {
                  setAttachmentFile(file);
                  setAttachmentDataUrl(dataUrl);
                }}
                onFileRemove={() => {
                  setAttachmentFile(null);
                  setAttachmentDataUrl("");
                }}
                selectedFile={attachmentFile ? { name: attachmentFile.name, size: attachmentFile.size, type: attachmentFile.type } : null}
              />
            </CollapsibleContent>
          </Collapsible>

          <div className="mt-[2px] flex gap-3 border-t border-[rgba(32,27,72,0.07)] pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="h-11 flex-1 rounded-full border-[1.5px] border-[#e6e5f0] text-[14.5px] font-semibold text-[#6a6a85] hover:border-[#e6e5f0] hover:bg-[#f7f6fb] hover:text-[#6a6a85]"
            >
              取消
            </Button>
            <Button
              type="submit"
              className="h-11 flex-1 rounded-full text-[14.5px] font-semibold"
            >
              保存
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
