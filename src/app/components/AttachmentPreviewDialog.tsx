import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Download } from "lucide-react";
import type { HealthAttachment } from "@/app/services/attachment";

interface AttachmentPreviewDialogProps {
  attachment: HealthAttachment | null;
  onClose: () => void;
}

export function AttachmentPreviewDialog({ attachment, onClose }: AttachmentPreviewDialogProps) {
  if (!attachment) return null;

  const handleDownload = () => {
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
          {isImage ? (
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
          <Button onClick={handleDownload} size="sm">
            <Download className="h-4 w-4 mr-1" />
            下载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
