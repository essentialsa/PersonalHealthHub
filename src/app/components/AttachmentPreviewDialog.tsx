import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Download, Loader2 } from "lucide-react";
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[80vw] h-[80vh] max-w-none flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm truncate">{attachment.fileName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 rounded-lg">
          {!attachment.data ? (
            <div className="flex flex-col items-center gap-2 text-gray-500">
              {loading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
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
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <iframe
              src={attachment.data}
              className="w-full h-full border-0 rounded-lg"
              title={attachment.fileName}
            />
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleDownload} size="sm" disabled={!attachment.data}>
            <Download className="h-4 w-4 mr-1" />
            下载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
