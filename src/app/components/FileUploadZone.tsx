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
      <div className={cn("flex items-center gap-2 p-2 border border-violet-200 rounded-lg bg-violet-50/50", className)}>
        <FileText className="h-4 w-4 text-violet-500 shrink-0" />
        <span className="text-sm text-gray-700 truncate flex-1">{selectedFile.name}</span>
        <span className="text-xs text-gray-400 shrink-0">
          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-gray-400 hover:text-rose-500"
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
          "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-violet-400 bg-violet-50"
            : "border-gray-200 hover:border-violet-300 hover:bg-violet-50/30",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud className="h-6 w-6 mx-auto text-gray-400 mb-1" />
        <p className="text-sm text-gray-500">
          拖拽文件到此处，或<span className="text-violet-500">点击选择</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          支持图片和 PDF，最大 10MB
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
        <p className="text-xs text-rose-500">{error}</p>
      )}
    </div>
  );
}
