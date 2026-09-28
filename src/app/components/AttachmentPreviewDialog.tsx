import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import type { HealthAttachment } from "@/app/services/attachment";

interface AttachmentPreviewDialogProps {
  attachment: HealthAttachment | null;
  /** 附件内容尚未从云端取回时为 true，展示加载中状态 */
  loading?: boolean;
  onClose: () => void;
}

export function AttachmentPreviewDialog({ attachment, loading = false, onClose }: AttachmentPreviewDialogProps) {
  if (!attachment) return null;

  const handleDownload = () => {
    if (!attachment.data) return;
    const link = document.createElement("a");
    link.href = attachment.data;
    link.download = attachment.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isImage = attachment.fileType.startsWith("image/");
  const typeLabel = attachment.fileType === "application/pdf" ? "PDF 文档" : isImage ? "图片" : "文件";
  const sizeLabel = attachment.fileSize >= 1024 * 1024
    ? `${(attachment.fileSize / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(attachment.fileSize / 1024))} KB`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[min(1152px,92vw)] h-[min(720px,86vh)] max-w-none flex flex-col gap-0 p-0">
        <DialogHeader className="flex-none h-[58px] flex-row items-center gap-3 border-b border-[rgba(124,108,240,0.14)] bg-gradient-to-b from-white/95 to-[#f9f8ff]/90 px-5 pr-14">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#8b7cf6] via-[#6c5ce7] to-[#3b82f6] text-white shadow-[0_8px_18px_rgba(108,92,231,0.42),inset_0_1px_0_rgba(255,255,255,0.38)]">
            <FileText className="h-[19px] w-[19px]" strokeWidth={2} />
          </span>
          <DialogTitle className="flex-1 min-w-0 truncate text-sm font-semibold text-[#2e2c4a]">
            {attachment.fileName}
          </DialogTitle>
        </DialogHeader>

        <div
          className="relative flex-1 overflow-auto flex items-center justify-center"
          style={{
            background:
              "radial-gradient(ellipse 600px 400px at 50% 34%, rgba(124,108,240,0.15) 0%, transparent 70%), radial-gradient(ellipse 460px 340px at 9% 92%, rgba(108,92,231,0.12) 0%, transparent 70%), radial-gradient(ellipse 520px 380px at 91% 94%, rgba(6,182,212,0.08) 0%, transparent 72%), linear-gradient(165deg, #f7f5ff 0%, #f0edfb 55%, #e9e5f7 100%)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(108,92,231,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(108,92,231,0.05) 1px, transparent 1px)",
              backgroundSize: "42px 42px",
            }}
          />
          {!attachment.data ? (
            <div className="relative z-[1] flex flex-col items-center gap-2 text-[#5a5a75]">
              {loading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-[#6c5ce7]" />
                  <span className="text-sm">正在从云端获取附件…</span>
                </>
              ) : (
                <span className="text-sm">附件内容不可用：本地缓存已被清理且云端尚未同步，请先完成云同步。</span>
              )}
            </div>
          ) : isImage ? (
            <img
              src={attachment.data}
              alt={attachment.fileName}
              className="relative z-[1] max-w-full max-h-full object-contain rounded-[10px] shadow-[0_30px_64px_rgba(76,62,150,0.26),0_10px_24px_rgba(76,62,150,0.16)]"
            />
          ) : (
            <iframe
              src={attachment.data}
              className="relative z-[1] w-full h-full border-0"
              title={attachment.fileName}
            />
          )}
        </div>

        <div className="flex h-[60px] flex-none items-center justify-between border-t border-[rgba(124,108,240,0.14)] bg-gradient-to-b from-white/95 to-[#f8f7fd]/95 px-[22px]">
          <span className="flex select-none items-center gap-[9px] text-xs text-[#a2a2bb]">
            <span className="h-[6px] w-[6px] rounded-full bg-[#8b7cf6] shadow-[0_0_8px_rgba(139,124,246,0.5)]" />
            <span>{typeLabel} · {sizeLabel}</span>
            {attachment.driveFileId && (
              <span className="inline-flex items-center gap-[6px] before:h-[6px] before:w-[6px] before:rounded-full before:bg-[#14b8a6] before:shadow-[0_0_8px_rgba(20,184,166,0.45)] before:content-['']">
                云端已同步
              </span>
            )}
          </span>
          <Button
            onClick={handleDownload}
            size="sm"
            disabled={!attachment.data}
            className="h-[34px] rounded-full px-5 text-[13px] font-semibold"
          >
            <Download className="h-[15px] w-[15px] mr-1" strokeWidth={2.1} />
            下载
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
