import { useState, useRef } from "react";
import { Button } from "@/app/components/ui/button";
import { UploadCloud, X, FileText } from "lucide-react";
import { validateFile, ALLOWED_TYPES, MAX_FILE_SIZE } from "@/app/services/attachment";
import { cn } from "@/app/components/ui/utils";

interface FileUploadZoneProps {
  onFileSelect: (file: File, dataUrl: string) => void;
  onFileRemove: () => void;
  selectedFile?: { name: string; size: number; type: string } | null;
  className?: string;
}

export function FileUploadZone({
  onFileSelect,
  onFileRemove,
  selectedFile,
  className,
}: FileUploadZoneProps) {
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const result = validateFile(file);
    if (!result.valid) {
      setError(result.error || "文件校验失败");
      return;
    }
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      onFileSelect(file, reader.result as string);
    };
    reader.onerror = () => {
      setError("文件读取失败，请重试");
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (selectedFile) {
    return (
      <div className={cn("flex items-center gap-2 p-2 border border-[rgba(32,27,72,0.09)] rounded-[12px] bg-[#fafafd]", className)}>
        <div className="size-7 rounded-[8px] bg-gradient-to-br from-[#7b6cf6] to-[#6c5ce7] flex items-center justify-center shrink-0">
          <FileText className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm text-[#20203a] truncate flex-1">{selectedFile.name}</span>
        <span className="text-xs text-[#9a9ab0] shrink-0">
          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-[#9a9ab0] hover:text-[#e5315c] hover:bg-[#fdeef2]"
          onClick={onFileRemove}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "border-2 border-dashed rounded-[14px] p-4 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-[#8b5cf6] bg-[#f4f2fe]"
            : "border-[#ddd6fe] hover:border-[#a78bfa] hover:bg-[#f4f2fe]/50",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud className="h-6 w-6 mx-auto text-[#9a9ab0] mb-1" />
        <p className="text-sm text-[#5a5a75]">
          拖拽文件到此处，或<span className="text-[#6c5ce7] font-semibold">点击选择</span>
        </p>
        <p className="text-xs text-[#9a9ab0] mt-1">
          支持图片和 PDF，最大 {MAX_FILE_SIZE / 1024 / 1024}MB
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={handleInputChange}
      />
      {error && (
        <p className="text-xs text-[#e5315c]">{error}</p>
      )}
    </div>
  );
}
