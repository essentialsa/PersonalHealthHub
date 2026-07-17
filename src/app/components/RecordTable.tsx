import { useState, type ChangeEvent } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Trash2, Database, Pencil, PlusCircle, Paperclip, ArrowUp, ArrowDown, RefreshCw, X } from "lucide-react";
import { HealthRecord, IndicatorItem } from "./AddRecordDialog";
import type { HealthAttachment } from "@/app/services/attachment";
import { FileUploadZone } from "./FileUploadZone";

interface RecordTableProps {
  records: HealthRecord[];
  indicators: IndicatorItem[];
  onDeleteRecord: (id: string) => void;
  onUpdateRecord: (record: HealthRecord) => void;
  onAddFollowupRecord: (base: HealthRecord, payload: { date: string; value: number }) => void;
  attachments?: HealthAttachment[];
  onPreviewAttachment?: (attachmentId: string) => void;
  onAddAttachment?: (attachment: HealthAttachment) => boolean;
  onDeleteAttachment?: (attachmentId: string) => void;
}

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

export function RecordTable({
  records,
  indicators,
  onDeleteRecord,
  onUpdateRecord,
  onAddFollowupRecord,
  attachments = [],
  onPreviewAttachment,
  onAddAttachment,
  onDeleteAttachment,
}: RecordTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editAttachmentFile, setEditAttachmentFile] = useState<File | null>(null);
  const [editAttachmentDataUrl, setEditAttachmentDataUrl] = useState<string>("");
  const [editAttachmentMode, setEditAttachmentMode] = useState<"none" | "add" | "replace">("none");

  const getIndicatorLabel = (type: string) => {
    const indicator = indicators.find(t => t.id === type);
    return indicator ? indicator.label : type;
  };

  const getIndicatorRange = (type: string): string | undefined => {
    const indicator = indicators.find(t => t.id === type);
    return indicator?.referenceRange;
  };

  const formatOperationAt = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("zh-CN");
  };

  const sortedRecords = [...records].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const handleStartEdit = (record: HealthRecord) => {
    setEditingId(record.id);
    setEditDate(record.date);
    setEditValue(String(record.value));
    setEditAttachmentFile(null);
    setEditAttachmentDataUrl("");
    setEditAttachmentMode("none");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDate("");
    setEditValue("");
    setEditAttachmentFile(null);
    setEditAttachmentDataUrl("");
    setEditAttachmentMode("none");
  };

  const handleSaveEdit = (record: HealthRecord) => {
    if (!editDate) return;
    const parsed = parseFloat(editValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert("请输入有效的非负数值。");
      return;
    }

    let attachmentId = record.attachmentId;

    // Handle attachment changes
    if (editAttachmentMode === "add" || editAttachmentMode === "replace") {
      if (editAttachmentFile && editAttachmentDataUrl && onAddAttachment) {
        // Delete old attachment if replacing
        if (editAttachmentMode === "replace" && record.attachmentId && onDeleteAttachment) {
          onDeleteAttachment(record.attachmentId);
        }
        // Create new attachment
        const newAttachmentId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const attachment: HealthAttachment = {
          id: newAttachmentId,
          fileName: editAttachmentFile.name,
          fileType: editAttachmentFile.type,
          fileSize: editAttachmentFile.size,
          data: editAttachmentDataUrl,
          date: editDate,
          createdAt: new Date().toISOString(),
        };
        if (onAddAttachment(attachment)) {
          attachmentId = newAttachmentId;
        }
      }
    } else if (editAttachmentMode === "none" && !editAttachmentFile && record.attachmentId) {
      // Keep existing attachment
    }

    onUpdateRecord({ ...record, date: editDate, value: parsed, attachmentId });
    handleCancelEdit();
  };

  const handleSaveAsNew = (record: HealthRecord) => {
    if (!editDate) return;
    const parsed = parseFloat(editValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert("请输入有效的非负数值。");
      return;
    }

    let attachmentId: string | undefined;

    // Handle attachment for new record
    if (editAttachmentFile && editAttachmentDataUrl && onAddAttachment) {
      const newAttachmentId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const attachment: HealthAttachment = {
        id: newAttachmentId,
        fileName: editAttachmentFile.name,
        fileType: editAttachmentFile.type,
        fileSize: editAttachmentFile.size,
        data: editAttachmentDataUrl,
        date: editDate,
        createdAt: new Date().toISOString(),
      };
      if (onAddAttachment(attachment)) {
        attachmentId = newAttachmentId;
      }
    }

    onAddFollowupRecord(record, { date: editDate, value: parsed });
    handleCancelEdit();
  };

  const colClass = "w-[13%]";

  return (
    <div className="border border-violet-100 overflow-hidden bg-white/40">
      <Table>
        <TableHeader>
          <TableRow className="border-violet-100 hover:bg-violet-50/50">
            <TableHead className={`text-gray-700 ${colClass}`}>数据日期</TableHead>
            <TableHead className={`text-gray-700 ${colClass}`}>检验指标</TableHead>
            <TableHead className={`text-gray-700 ${colClass}`}>数值</TableHead>
            <TableHead className={`text-gray-700 ${colClass}`}>参考范围</TableHead>
            <TableHead className={`text-gray-700 ${colClass}`}>操作日期</TableHead>
            <TableHead className={`text-gray-700 ${colClass}`}>附件</TableHead>
            <TableHead className={`${colClass} text-right text-gray-700`}>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRecords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-gray-500 py-12">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center mb-2">
                    <Database className="w-8 h-8 text-violet-400" />
                  </div>
                  <p className="text-gray-600">暂无数据</p>
                  <p className="text-sm text-gray-400">点击上方按钮添加记录</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            sortedRecords.map(record => {
              const isEditing = editingId === record.id;
              const range = getIndicatorRange(record.indicatorType);
              const rangeStatus = checkRange(record.value, range);

              return (
                <TableRow
                  key={record.id}
                  className="border-violet-100 hover:bg-violet-50/30 transition-colors"
                >
                  <TableCell className="text-gray-700 py-3 align-middle whitespace-nowrap">
                    {isEditing ? (
                      <Input
                        type="date"
                        value={editDate}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setEditDate(e.target.value)}
                        className="h-8 border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                      />
                    ) : (
                      record.date
                    )}
                  </TableCell>
                  <TableCell className="text-gray-700 py-3 align-middle">
                    {getIndicatorLabel(record.indicatorType)}
                  </TableCell>
                  <TableCell className="py-3 align-middle">
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.1"
                        value={editValue}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                        placeholder="输入数值"
                        className="h-8 border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          rangeStatus === "above"
                            ? "bg-red-50 text-red-600"
                            : rangeStatus === "below"
                              ? "bg-red-50 text-red-600"
                              : "bg-gradient-to-r from-violet-100 to-blue-100 text-violet-700"
                        }`}>
                          {record.value} {record.unit}
                        </span>
                        {rangeStatus === "above" && (
                          <ArrowUp className="w-4 h-4 text-red-500" />
                        )}
                        {rangeStatus === "below" && (
                          <ArrowDown className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm py-3 align-middle">
                    {range || "-"}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 py-3 align-middle whitespace-nowrap">
                    {formatOperationAt(record.operationAt)}
                  </TableCell>
                  <TableCell className="text-center">
                    {isEditing ? (
                      <div className="flex flex-col items-center gap-1">
                        {record.attachmentId && editAttachmentMode === "none" && !editAttachmentFile ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 p-0 text-violet-500 hover:text-violet-600 hover:bg-violet-50"
                              onClick={() => onPreviewAttachment?.(record.attachmentId!)}
                            >
                              <Paperclip className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 p-0 text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                              onClick={() => setEditAttachmentMode("replace")}
                              title="替换附件"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 p-0 text-rose-400 hover:text-rose-500 hover:bg-rose-50"
                              onClick={() => {
                                if (onDeleteAttachment && record.attachmentId) {
                                  onDeleteAttachment(record.attachmentId);
                                }
                                setEditAttachmentMode("none");
                              }}
                              title="移除附件"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : editAttachmentFile ? (
                          <div className="flex items-center gap-1">
                            <Paperclip className="h-3.5 w-3.5 text-violet-500" />
                            <span className="text-xs text-gray-600 truncate max-w-[60px]">{editAttachmentFile.name}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 p-0 text-rose-400 hover:text-rose-500"
                              onClick={() => {
                                setEditAttachmentFile(null);
                                setEditAttachmentDataUrl("");
                                setEditAttachmentMode("none");
                              }}
                            >
                              <X className="h-3 w-3" />
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
                      record.attachmentId && onPreviewAttachment && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 p-0 text-violet-500 hover:text-violet-600 hover:bg-violet-50"
                          onClick={() => onPreviewAttachment(record.attachmentId!)}
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      )
                    )}
                  </TableCell>
                  <TableCell className="py-3 align-middle">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSaveEdit(record)}
                          className="h-8 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        >
                          保存
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="h-8 border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          取消
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSaveAsNew(record)}
                          className="h-8 border-violet-200 text-violet-600 hover:bg-violet-50"
                        >
                          <PlusCircle className="w-4 h-4 mr-1" />
                          新增后续
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(record)}
                          className="h-8 w-8 p-0 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const ok = window.confirm("确定要删除这条记录吗？");
                            if (!ok) return;
                            onDeleteRecord(record.id);
                          }}
                          className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
