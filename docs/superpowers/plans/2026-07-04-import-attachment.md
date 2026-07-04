---
change: import-attachment
design-doc: docs/superpowers/specs/2026-07-04-import-attachment-design.md
base-ref: c98640998a9f4a3d3f4e10dc855607b861a01e9c
---

# 检验指标附件导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 为检验指标导入流程新增附件支持，允许用户上传检查报告（图片/PDF），附件可关联类别和日期，在查看界面可预览和下载。

**Architecture:** 采用 localStorage 独立存储附件（`health_attachments_v1`），通过 `attachmentId` 将 HealthRecord 与 HealthAttachment 关联。文件以 base64 data URL 形式存储，新增独立存储层处理 CRUD 和大小校验。附件上传组件在 Excel 导入和 OCR 导入对话框中集成，RecordTable 和 RecordChart 中展示附件图标并支持预览/下载。

**Tech Stack:** React + TypeScript, shadcn/ui (Dialog, Button, Checkbox, Collapsible), lucide-react (icons), vitest + @testing-library/react, localStorage

## Global Constraints

- 单文件最大 10MB，所有附件总大小最大 20MB
- 支持的文件类型：`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`
- 附件以 base64 data URL 存储在 localStorage 键 `health_attachments_v1`
- HealthRecord 通过可选 `attachmentId` 字段关联单个附件
- 删除记录时仅移除 attachmentId 引用，不删除附件本身
- 删除附件时级联清除关联记录的 attachmentId

---

## File Structure

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| Create | `src/app/services/attachment.ts` | 附件存储层（CRUD、校验、大小限制） |
| Create | `src/app/components/FileUploadZone.tsx` | 可复用的文件上传组件（选择、预览、移除） |
| Create | `src/app/components/AttachmentPreviewDialog.tsx` | 附件预览对话框（图片/PDF） |
| Create | `src/app/services/attachment.test.ts` | 附件存储层单元测试 |
| Create | `src/app/services/attachmentValidation.test.ts` | 文件校验单元测试 |
| Modify | `src/app/components/AddRecordDialog.tsx:32-39` | HealthRecord 接口新增 `attachmentId` |
| Modify | `src/app/App.tsx:65-73` | 新增 ATTACHMENTS_STORAGE_KEY 常量 |
| Modify | `src/app/App.tsx:2759` | 新增 attachments state 和 handlers |
| Modify | `src/app/App.tsx:3119-3130` | 新增 attachments 的 localStorage 读写 effect |
| Modify | `src/app/App.tsx:4130` | handleImportRecords 支持附件关联 |
| Modify | `src/app/components/ImportRecordsDialog.tsx:32-36` | Props 新增附件回调 |
| Modify | `src/app/components/ImportRecordsDialog.tsx:120-139` | 添加附件折叠区域 |
| Modify | `src/app/components/MedicalReportImportDialog.tsx:29-33` | Props 新增附件回调 |
| Modify | `src/app/components/MedicalReportImportDialog.tsx:107-121` | 添加保留报告选项 |
| Modify | `src/app/components/RecordTable.tsx:8-14` | Props 新增 attachments 和 onPreviewAttachment |
| Modify | `src/app/components/RecordTable.tsx:96-101` | 表头新增附件列 |
| Modify | `src/app/components/RecordTable.tsx:188-213` | 操作列新增附件图标 |
| Modify | `src/app/components/RecordChart.tsx:10-14` | Props 新增 attachments 和 onPreviewAttachment |
| Modify | `src/app/components/RecordChart.tsx:483-501` | 明细表新增附件图标列 |

---

## Task 1: HealthAttachment 数据模型与类型定义

**Files:**
- Modify: `src/app/components/AddRecordDialog.tsx:32-39`
- Create: `src/app/services/attachment.ts`

**Interfaces:**
- Consumes: 无
- Produces: `HealthAttachment` 接口, 扩展后的 `HealthRecord` 接口

- [x] **Step 1: 在 AddRecordDialog.tsx 中扩展 HealthRecord 接口**

在 `src/app/components/AddRecordDialog.tsx` 的 `HealthRecord` 接口末尾添加 `attachmentId` 字段：

```typescript
export interface HealthRecord {
  id: string;
  date: string;
  indicatorType: string;
  value: number;
  unit: string;
  operationAt?: string;
  attachmentId?: string;  // 新增：关联附件 ID
}
```

- [x] **Step 2: 创建 attachment.ts 并定义 HealthAttachment 接口**

创建 `src/app/services/attachment.ts`，定义接口：

```typescript
export interface HealthAttachment {
  id: string;           // 唯一标识，格式：`${timestamp}_${random}`
  fileName: string;     // 原始文件名
  fileType: string;     // MIME 类型
  fileSize: number;     // 原始文件大小（字节）
  data: string;         // base64 data URL
  date: string;         // 关联日期
  categoryId?: string;  // 关联类别（可选）
  createdAt: string;    // 创建时间（ISO timestamp）
}

export const ATTACHMENTS_KEY = 'health_attachments_v1';
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB
```

- [x] **Step 3: Commit**

```bash
git add src/app/components/AddRecordDialog.tsx src/app/services/attachment.ts
git commit -m "feat(attachment): define HealthAttachment interface and extend HealthRecord"
```

---

## Task 2: 附件存储层

**Files:**
- Modify: `src/app/services/attachment.ts`
- Create: `src/app/services/attachment.test.ts`

**Interfaces:**
- Consumes: `HealthAttachment`, `ATTACHMENTS_KEY`, `MAX_FILE_SIZE`, `MAX_TOTAL_SIZE` (Task 1)
- Produces: `loadAttachments()`, `saveAttachments()`, `addAttachment()`, `deleteAttachment()`

- [x] **Step 1: 编写附件存储函数的单元测试**

创建 `src/app/services/attachment.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAttachments,
  saveAttachments,
  addAttachment,
  deleteAttachment,
  ATTACHMENTS_KEY,
} from './attachment';
import type { HealthAttachment } from './attachment';

const makeAttachment = (overrides: Partial<HealthAttachment> = {}): HealthAttachment => ({
  id: '123456_abc',
  fileName: 'report.pdf',
  fileType: 'application/pdf',
  fileSize: 1024,
  data: 'data:application/pdf;base64,abc123',
  date: '2026-07-04',
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('attachment storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadAttachments returns empty array when no data', () => {
    expect(loadAttachments()).toEqual([]);
  });

  it('saveAttachments and loadAttachments round-trip', () => {
    const a1 = makeAttachment({ id: '1' });
    const a2 = makeAttachment({ id: '2', fileName: 'scan.jpg' });
    saveAttachments([a1, a2]);
    const loaded = loadAttachments();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('1');
    expect(loaded[1].fileName).toBe('scan.jpg');
  });

  it('addAttachment succeeds when under size limits', () => {
    const a = makeAttachment({ fileSize: 1024 });
    expect(addAttachment(a)).toBe(true);
    expect(loadAttachments()).toHaveLength(1);
  });

  it('addAttachment fails when single file exceeds 10MB', () => {
    const a = makeAttachment({ fileSize: 11 * 1024 * 1024 });
    expect(addAttachment(a)).toBe(false);
    expect(loadAttachments()).toHaveLength(0);
  });

  it('addAttachment fails when total size exceeds 20MB', () => {
    const a1 = makeAttachment({ id: '1', fileSize: 15 * 1024 * 1024 });
    const a2 = makeAttachment({ id: '2', fileSize: 10 * 1024 * 1024 });
    addAttachment(a1);
    expect(addAttachment(a2)).toBe(false);
    expect(loadAttachments()).toHaveLength(1);
  });

  it('deleteAttachment removes attachment and clears referencing records', () => {
    const a = makeAttachment({ id: 'att1' });
    saveAttachments([a]);
    const records = [
      { id: 'r1', date: '2026-07-04', indicatorType: 'bp', value: 120, unit: 'mmHg', attachmentId: 'att1' },
      { id: 'r2', date: '2026-07-04', indicatorType: 'gl', value: 5.2, unit: 'mmol/L' },
    ];
    localStorage.setItem('health_records_v1', JSON.stringify(records));
    
    deleteAttachment('att1');
    
    expect(loadAttachments()).toHaveLength(0);
    const updatedRecords = JSON.parse(localStorage.getItem('health_records_v1') || '[]');
    expect(updatedRecords[0].attachmentId).toBeUndefined();
    expect(updatedRecords[1].attachmentId).toBeUndefined();
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/app/services/attachment.test.ts`
Expected: FAIL — `loadAttachments` 等函数尚未实现

- [x] **Step 3: 实现附件存储函数**

在 `src/app/services/attachment.ts` 中添加：

```typescript
// 加载附件
export const loadAttachments = (): HealthAttachment[] => {
  try {
    const data = localStorage.getItem(ATTACHMENTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

// 保存附件
export const saveAttachments = (attachments: HealthAttachment[]) => {
  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(attachments));
};

// 添加附件
export const addAttachment = (attachment: HealthAttachment): boolean => {
  const attachments = loadAttachments();
  const totalSize = attachments.reduce((sum, a) => sum + a.fileSize, 0);

  if (attachment.fileSize > MAX_FILE_SIZE) {
    return false;
  }

  if (totalSize + attachment.fileSize > MAX_TOTAL_SIZE) {
    return false;
  }

  attachments.push(attachment);
  saveAttachments(attachments);
  return true;
};

// 删除附件
export const deleteAttachment = (attachmentId: string) => {
  const attachments = loadAttachments();
  const filtered = attachments.filter(a => a.id !== attachmentId);
  saveAttachments(filtered);

  // 级联更新 HealthRecord
  try {
    const recordsData = localStorage.getItem('health_records_v1');
    if (recordsData) {
      const records = JSON.parse(recordsData);
      const updated = records.map((r: { attachmentId?: string }) =>
        r.attachmentId === attachmentId ? { ...r, attachmentId: undefined } : r,
      );
      localStorage.setItem('health_records_v1', JSON.stringify(updated));
    }
  } catch {
    // 忽略记录更新失败
  }
};
```

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/app/services/attachment.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/app/services/attachment.ts src/app/services/attachment.test.ts
git commit -m "feat(attachment): implement attachment storage layer with tests"
```

---

## Task 3: 文件校验工具

**Files:**
- Modify: `src/app/services/attachment.ts`
- Create: `src/app/services/attachmentValidation.test.ts`

**Interfaces:**
- Consumes: `ALLOWED_TYPES`, `MAX_FILE_SIZE` (Task 1)
- Produces: `validateFile(file: File): { valid: boolean; error?: string }`

- [x] **Step 1: 编写文件校验单元测试**

创建 `src/app/services/attachmentValidation.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { validateFile } from './attachment';

const makeFile = (type: string, size: number, name = 'test.pdf'): File => {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
};

describe('validateFile', () => {
  it('accepts valid PDF', () => {
    const file = makeFile('application/pdf', 1024);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('accepts valid JPEG', () => {
    const file = makeFile('image/jpeg', 2048);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('accepts valid PNG', () => {
    const file = makeFile('image/png', 2048);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('accepts valid GIF', () => {
    const file = makeFile('image/gif', 2048);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('accepts valid WebP', () => {
    const file = makeFile('image/webp', 2048);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  it('rejects unsupported type', () => {
    const file = makeFile('text/plain', 1024);
    expect(validateFile(file)).toEqual({
      valid: false,
      error: '不支持的文件类型，请上传图片或 PDF',
    });
  });

  it('rejects file exceeding 10MB', () => {
    const file = makeFile('application/pdf', 11 * 1024 * 1024);
    expect(validateFile(file)).toEqual({
      valid: false,
      error: '文件大小超过限制（最大 10MB）',
    });
  });

  it('accepts file at exactly 10MB', () => {
    const file = makeFile('application/pdf', 10 * 1024 * 1024);
    expect(validateFile(file)).toEqual({ valid: true });
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/app/services/attachmentValidation.test.ts`
Expected: FAIL — `validateFile` 尚未实现

- [x] **Step 3: 在 attachment.ts 中实现 validateFile**

```typescript
export const validateFile = (file: File): { valid: boolean; error?: string } => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: '不支持的文件类型，请上传图片或 PDF' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` };
  }
  return { valid: true };
};
```

- [x] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/app/services/attachmentValidation.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/app/services/attachment.ts src/app/services/attachmentValidation.test.ts
git commit -m "feat(attachment): implement file validation with tests"
```

---

## Task 4: 附件上传组件 (FileUploadZone)

**Files:**
- Create: `src/app/components/FileUploadZone.tsx`

**Interfaces:**
- Consumes: `validateFile()` (Task 3), `ALLOWED_TYPES`, `MAX_FILE_SIZE` (Task 1)
- Produces: `<FileUploadZone>` 组件 — `onFileSelect(file: File, dataUrl: string)`, `onFileRemove()`

- [x] **Step 1: 创建 FileUploadZone 组件**

创建 `src/app/components/FileUploadZone.tsx`：

```tsx
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
```

- [x] **Step 2: Commit**

```bash
git add src/app/components/FileUploadZone.tsx
git commit -m "feat(attachment): create reusable FileUploadZone component"
```

---

## Task 5: 附件状态管理 (App.tsx)

**Files:**
- Modify: `src/app/App.tsx:65-73`
- Modify: `src/app/App.tsx:2759`
- Modify: `src/app/App.tsx:3119-3130`

**Interfaces:**
- Consumes: `HealthAttachment`, `loadAttachments`, `saveAttachments`, `addAttachment`, `deleteAttachment`, `ATTACHMENTS_KEY` (Tasks 1-2)
- Produces: `attachments` state, `handleAddAttachment`, `handleDeleteAttachment` handlers, 传入子组件的 props

- [x] **Step 1: 在 App.tsx 中添加存储键常量**

在 `src/app/App.tsx` 第 71 行（`INDICATOR_CHANGE_LOG_STORAGE_KEY` 之后）添加：

```typescript
const ATTACHMENTS_STORAGE_KEY = `health_attachments_${STORAGE_VERSION}`;
```

- [x] **Step 2: 在 App.tsx 中添加 attachments state**

在 `src/app/App.tsx` 第 2771 行（`authConfig` 之后）添加：

```typescript
const [attachments, setAttachments] = useState<HealthAttachment[]>([]);
```

在文件顶部的 import 区域添加：

```typescript
import { type HealthAttachment, loadAttachments as loadAttachmentsStorage, saveAttachments as saveAttachmentsStorage, addAttachment as addAttachmentStorage, deleteAttachment as deleteAttachmentStorage, ATTACHMENTS_KEY } from "@/app/services/attachment";
```

- [x] **Step 3: 添加 localStorage 读取 effect**

在 `src/app/App.tsx` 现有的 `useEffect` 读取区域（约 2824-2945 行附近），添加一个读取附件的 effect：

```typescript
useEffect(() => {
  if (supabaseEnabled && !activeUserId) return;
  const saved = loadAttachmentsStorage();
  if (saved.length > 0) {
    setAttachments(saved);
  }
}, [supabaseEnabled, activeUserId]);
```

- [x] **Step 4: 添加 localStorage 写入 effect**

在 `src/app/App.tsx` 现有的写入 effect 区域（约 3130 行之后），添加：

```typescript
useEffect(() => {
  if (supabaseEnabled && !activeUserId) return;
  if (attachments.length > 0) {
    saveAttachmentsStorage(attachments);
  } else {
    localStorage.removeItem(ATTACHMENTS_KEY);
  }
}, [attachments, supabaseEnabled, activeUserId]);
```

- [x] **Step 5: 添加附件操作 handlers**

在 `src/app/App.tsx` 的 handler 区域（`handleImportRecords` 附近），添加：

```typescript
const handleAddAttachment = (attachment: HealthAttachment): boolean => {
  const success = addAttachmentStorage(attachment);
  if (success) {
    setAttachments(prev => [...prev, attachment]);
  }
  return success;
};

const handleDeleteAttachment = (attachmentId: string) => {
  deleteAttachmentStorage(attachmentId);
  setAttachments(prev => prev.filter(a => a.id !== attachmentId));
};
```

- [x] **Step 6: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(attachment): add attachment state management to App.tsx"
```

---

## Task 6: Excel 导入附件集成

**Files:**
- Modify: `src/app/components/ImportRecordsDialog.tsx:32-36`
- Modify: `src/app/components/ImportRecordsDialog.tsx:120-139`

**Interfaces:**
- Consumes: `FileUploadZone` (Task 4), `HealthAttachment` (Task 1), `handleAddAttachment` (Task 5)
- Produces: 导入时创建 HealthAttachment 并关联到 HealthRecord

- [x] **Step 1: 在 ImportRecordsDialog 中添加附件 props**

修改 `src/app/components/ImportRecordsDialog.tsx` 的 `ImportRecordsDialogProps` 接口：

```typescript
import type { HealthAttachment } from "@/app/services/attachment";

interface ImportRecordsDialogProps {
  categories: IndicatorCategory[];
  onImportRecords: (records: HealthRecord[]) => void;
  onAddAttachment?: (attachment: HealthAttachment) => boolean;
  triggerClassName?: string;
}
```

在函数参数解构中添加 `onAddAttachment`：

```typescript
export function ImportRecordsDialog({ categories, onImportRecords, onAddAttachment, triggerClassName }: ImportRecordsDialogProps) {
```

- [x] **Step 2: 添加附件状态和文件处理**

在组件内部状态中添加：

```typescript
const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
const [attachmentDataUrl, setAttachmentDataUrl] = useState<string>("");
```

添加导入时创建附件的逻辑。修改 `handleImport` 函数（约 340-360 行），在 `onImportRecords(records)` 之前添加：

```typescript
// 创建附件并关联到导入的记录
if (attachmentFile && attachmentDataUrl && onAddAttachment) {
  const attachmentId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const attachment: HealthAttachment = {
    id: attachmentId,
    fileName: attachmentFile.name,
    fileType: attachmentFile.type,
    fileSize: attachmentFile.size,
    data: attachmentDataUrl,
    date: records[0]?.date || new Date().toISOString().split("T")[0],
    createdAt: new Date().toISOString(),
  };
  onAddAttachment(attachment);
  records = records.map(r => ({ ...r, attachmentId }));
}
```

注意：将 `const records` 改为 `let records` 以便后续修改。

- [x] **Step 3: 添加附件折叠区域 UI**

在对话框内容底部（确认按钮之前），添加附件区域。需要 import `Collapsible`、`CollapsibleTrigger`、`CollapsibleContent`：

```tsx
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/app/components/ui/collapsible";
import { Paperclip } from "lucide-react";
import { FileUploadZone } from "./FileUploadZone";
```

在 JSX 中（确认导入按钮区域之前）添加：

```tsx
<Collapsible>
  <CollapsibleTrigger asChild>
    <Button type="button" variant="ghost" className="w-full justify-start text-gray-600">
      <Paperclip className="h-4 w-4 mr-2" />
      附件（可选）
    </Button>
  </CollapsibleTrigger>
  <CollapsibleContent>
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
```

- [x] **Step 4: 添加 reset 清理**

在 `handleReset` 函数中添加：

```typescript
setAttachmentFile(null);
setAttachmentDataUrl("");
```

- [x] **Step 5: Commit**

```bash
git add src/app/components/ImportRecordsDialog.tsx
git commit -m "feat(attachment): integrate attachment upload into Excel import dialog"
```

---

## Task 7: OCR 报告导入附件集成

**Files:**
- Modify: `src/app/components/MedicalReportImportDialog.tsx:29-33`
- Modify: `src/app/components/MedicalReportImportDialog.tsx:107-121`

**Interfaces:**
- Consumes: `HealthAttachment` (Task 1), `handleAddAttachment` (Task 5)
- Produces: OCR 导入时可选保留原始报告为附件

- [x] **Step 1: 在 MedicalReportImportDialog 中添加附件 props**

修改 `src/app/components/MedicalReportImportDialog.tsx` 的 `Props` 接口：

```typescript
import type { HealthAttachment } from "@/app/services/attachment";
import { Checkbox } from "@/app/components/ui/checkbox";

interface Props {
  onImportRecords: (records: HealthRecord[]) => void;
  onAddAttachment?: (attachment: HealthAttachment) => boolean;
  existingCategories?: UserIndicatorCategory[];
  triggerClassName?: string;
}
```

在函数参数解构中添加 `onAddAttachment`：

```typescript
export function MedicalReportImportDialog({ onImportRecords, onAddAttachment, existingCategories = [], triggerClassName }: Props) {
```

- [x] **Step 2: 添加保留报告状态**

在组件内部状态中添加：

```typescript
const [retainReport, setRetainReport] = useState(true);
```

- [x] **Step 3: 在 handleImport 中创建附件**

修改 `handleImport` 函数（约 107-121 行），在 `onImportRecords(records)` 之前添加：

```typescript
// 保留原始报告作为附件
if (retainReport && file && onAddAttachment) {
  const reader = new FileReader();
  reader.onload = () => {
    const attachment: HealthAttachment = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      data: reader.result as string,
      date,
      createdAt: new Date().toISOString(),
    };
    onAddAttachment(attachment);
    const recordsWithAttachment = records.map(r => ({ ...r, attachmentId: attachment.id }));
    onImportRecords(recordsWithAttachment);
    handleClose();
  };
  reader.readAsDataURL(file);
  return;
}

onImportRecords(records);
handleClose();
```

注意：需要将 `records` 用 `let` 声明（如果尚未如此）。

- [x] **Step 4: 在对话框中添加保留报告复选框**

在确认导入按钮区域之前，添加：

```tsx
<div className="flex items-center gap-2">
  <Checkbox
    id="retain-report"
    checked={retainReport}
    onCheckedChange={(checked) => setRetainReport(checked === true)}
  />
  <label htmlFor="retain-report" className="text-sm text-gray-700">
    保留原始报告作为附件
  </label>
</div>
```

- [x] **Step 5: 添加 reset 清理**

在 `handleClose` 函数中添加：

```typescript
setRetainReport(true);
```

- [x] **Step 6: Commit**

```bash
git add src/app/components/MedicalReportImportDialog.tsx
git commit -m "feat(attachment): integrate retain-report option into OCR import dialog"
```

---

## Task 8: App.tsx 传递附件 Props 到子组件

**Files:**
- Modify: `src/app/App.tsx:4708-4734`
- Modify: `src/app/App.tsx:4964-4970`

**Interfaces:**
- Consumes: `handleAddAttachment` (Task 5), `attachments` (Task 5)
- Produces: 子组件接收附件相关 props

- [x] **Step 1: 传递 onAddAttachment 到 ImportRecordsDialog**

修改 `src/app/App.tsx` 中 `<ImportRecordsDialog>` 调用（约 4730-4734 行）：

```tsx
<ImportRecordsDialog
  categories={indicatorCategories}
  onImportRecords={handleImportRecords}
  onAddAttachment={handleAddAttachment}
  triggerClassName={actionTriggerClassName}
/>
```

- [x] **Step 2: 传递 onAddAttachment 到 MedicalReportImportDialog**

修改 `src/app/App.tsx` 中 `<MedicalReportImportDialog>` 调用（约 4708-4724 行）：

```tsx
<MedicalReportImportDialog
  onImportRecords={handleImportRecords}
  onAddAttachment={handleAddAttachment}
  existingCategories={indicatorCategories.map(category => ({
    id: category.id,
    name: category.name,
    code: category.code,
    items: category.items.map(item => ({
      id: item.id,
      label: item.label,
      unit: item.unit,
      code: item.code,
      referenceRange: item.referenceRange,
      aliases: item.aliases,
    })),
  }))}
  triggerClassName={actionTriggerClassName}
/>
```

- [x] **Step 3: 传递 attachments 到 RecordTable**

修改 `src/app/App.tsx` 中 `<RecordTable>` 调用（约 4964-4970 行），添加附件相关 props：

```tsx
<RecordTable
  records={maintenanceRecords}
  indicators={maintenanceIndicators}
  onDeleteRecord={handleDeleteRecord}
  onUpdateRecord={handleUpdateRecord}
  onAddFollowupRecord={handleAddFollowupRecord}
  attachments={attachments}
  onPreviewAttachment={(id) => setPreviewAttachmentId(id)}
/>
```

- [x] **Step 4: 传递 attachments 到 RecordChart**

修改 `src/app/App.tsx` 中 `<RecordChart>` 调用（约 4927-4931 行）：

```tsx
<RecordChart
  records={records}
  indicators={indicatorItems}
  categories={indicatorCategories}
  attachments={attachments}
  onPreviewAttachment={(id) => setPreviewAttachmentId(id)}
/>
```

- [x] **Step 5: 添加 previewAttachmentId state**

在 App.tsx state 区域添加：

```typescript
const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
```

- [x] **Step 6: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(attachment): wire attachment props through App.tsx to child components"
```

---

## Task 9: 附件预览对话框 (AttachmentPreviewDialog)

**Files:**
- Create: `src/app/components/AttachmentPreviewDialog.tsx`

**Interfaces:**
- Consumes: `HealthAttachment` (Task 1)
- Produces: `<AttachmentPreviewDialog>` 组件 — 支持图片和 PDF 预览，下载按钮

- [x] **Step 1: 创建 AttachmentPreviewDialog 组件**

创建 `src/app/components/AttachmentPreviewDialog.tsx`：

```tsx
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
```

- [x] **Step 2: Commit**

```bash
git add src/app/components/AttachmentPreviewDialog.tsx
git commit -m "feat(attachment): create AttachmentPreviewDialog with image/PDF support"
```

---

## Task 10: RecordTable 附件展示

**Files:**
- Modify: `src/app/components/RecordTable.tsx:8-14`
- Modify: `src/app/components/RecordTable.tsx:96-101`
- Modify: `src/app/components/RecordTable.tsx:188-213`

**Interfaces:**
- Consumes: `HealthAttachment` (Task 1), `attachments` prop (Task 8)
- Produces: RecordTable 中显示附件图标，点击打开预览

- [x] **Step 1: 修改 RecordTable props**

修改 `src/app/components/RecordTable.tsx` 的 `RecordTableProps`：

```typescript
import type { HealthAttachment } from "@/app/services/attachment";
import { Paperclip } from "lucide-react";

interface RecordTableProps {
  records: HealthRecord[];
  indicators: IndicatorItem[];
  onDeleteRecord: (id: string) => void;
  onUpdateRecord: (record: HealthRecord) => void;
  onAddFollowupRecord: (base: HealthRecord, payload: { date: string; value: number }) => void;
  attachments?: HealthAttachment[];
  onPreviewAttachment?: (attachmentId: string) => void;
}
```

在函数参数解构中添加：

```typescript
export function RecordTable({
  records,
  indicators,
  onDeleteRecord,
  onUpdateRecord,
  onAddFollowupRecord,
  attachments = [],
  onPreviewAttachment,
}: RecordTableProps) {
```

- [x] **Step 2: 在表头添加附件列**

在 `src/app/components/RecordTable.tsx` 的 `<TableHeader>` 中（约 96-101 行），在操作列之前添加附件列：

```tsx
<TableHead className="text-gray-700 w-16">附件</TableHead>
```

- [x] **Step 3: 在空状态中更新 colSpan**

将空状态的 `colSpan={5}` 改为 `colSpan={6}`（第 107 行）。

- [x] **Step 4: 在操作列之前添加附件单元格**

在每行的 `<TableCell>` 操作列之前（约 188 行），添加附件单元格：

```tsx
<TableCell className="text-center">
  {record.attachmentId && onPreviewAttachment && (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 p-0 text-violet-500 hover:text-violet-600 hover:bg-violet-50"
      onClick={() => onPreviewAttachment(record.attachmentId!)}
    >
      <Paperclip className="h-4 w-4" />
    </Button>
  )}
</TableCell>
```

- [x] **Step 5: Commit**

```bash
git add src/app/components/RecordTable.tsx
git commit -m "feat(attachment): add attachment icon column to RecordTable"
```

---

## Task 11: RecordChart 附件展示

**Files:**
- Modify: `src/app/components/RecordChart.tsx:10-14`
- Modify: `src/app/components/RecordChart.tsx:483-501`

**Interfaces:**
- Consumes: `HealthAttachment` (Task 1), `attachments` prop (Task 8)
- Produces: RecordChart 明细表中显示附件图标

- [x] **Step 1: 修改 RecordChart props**

修改 `src/app/components/RecordChart.tsx` 的 `RecordChartProps`：

```typescript
import type { HealthAttachment } from "@/app/services/attachment";
import { Paperclip } from "lucide-react";

interface RecordChartProps {
  records: HealthRecord[];
  indicators: IndicatorItem[];
  categories: IndicatorCategory[];
  attachments?: HealthAttachment[];
  onPreviewAttachment?: (attachmentId: string) => void;
}
```

在函数参数解构中添加：

```typescript
export function RecordChart({
  records,
  indicators,
  categories,
  attachments = [],
  onPreviewAttachment,
}: RecordChartProps) {
```

- [x] **Step 2: 在明细表中添加附件列**

在 `src/app/components/RecordChart.tsx` 的明细表 `<TableHeader>` 中，在第一个 `<TableHead>` 之前添加：

```tsx
<TableHead className="text-gray-700 text-xs w-10">附件</TableHead>
```

在明细表 `<TableBody>` 的每行中，在日期 `<TableCell>` 之前添加：

```tsx
<TableCell className="text-xs text-center w-10">
  {/* 附件图标将在后续关联后显示 */}
</TableCell>
```

- [x] **Step 3: Commit**

```bash
git add src/app/components/RecordChart.tsx
git commit -m "feat(attachment): add attachment column to RecordChart detail table"
```

---

## Task 12: 附件预览对话框集成到 App.tsx

**Files:**
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `AttachmentPreviewDialog` (Task 9), `attachments` (Task 5), `previewAttachmentId` (Task 8)
- Produces: 在 App 中渲染预览对话框

- [x] **Step 1: 导入并渲染 AttachmentPreviewDialog**

在 `src/app/App.tsx` 顶部添加 import：

```typescript
import { AttachmentPreviewDialog } from "@/app/components/AttachmentPreviewDialog";
```

在 JSX 返回值的最外层（`<div>` 或根元素内部），添加：

```tsx
<AttachmentPreviewDialog
  attachment={attachments.find(a => a.id === previewAttachmentId) || null}
  onClose={() => setPreviewAttachmentId(null)}
/>
```

- [x] **Step 2: Commit**

```bash
git add src/app/App.tsx
git commit -m "feat(attachment): integrate AttachmentPreviewDialog into App.tsx"
```

---

## Task 13: 孤立附件检测与清理

**Files:**
- Modify: `src/app/services/attachment.ts`

**Interfaces:**
- Consumes: `loadAttachments()` (Task 2), HealthRecord[] (from localStorage)
- Produces: `findOrphanedAttachments()` 函数

- [x] **Step 1: 实现孤立附件检测**

在 `src/app/services/attachment.ts` 中添加：

```typescript
// 查找无引用的孤立附件
export const findOrphanedAttachments = (): HealthAttachment[] => {
  const attachments = loadAttachments();
  try {
    const recordsData = localStorage.getItem('health_records_v1');
    const records: { attachmentId?: string }[] = recordsData ? JSON.parse(recordsData) : [];
    const referencedIds = new Set(records.map(r => r.attachmentId).filter(Boolean));
    return attachments.filter(a => !referencedIds.has(a.id));
  } catch {
    return [];
  }
};

// 清理孤立附件
export const cleanupOrphanedAttachments = (): number => {
  const orphaned = findOrphanedAttachments();
  if (orphaned.length === 0) return 0;
  const orphanedIds = new Set(orphaned.map(a => a.id));
  const attachments = loadAttachments();
  const cleaned = attachments.filter(a => !orphanedIds.has(a.id));
  saveAttachments(cleaned);
  return orphaned.length;
};
```

- [x] **Step 2: Commit**

```bash
git add src/app/services/attachment.ts
git commit -m "feat(attachment): implement orphaned attachment detection and cleanup"
```

---

## Task 14: 全量测试验证

**Files:**
- Run all existing tests to verify no regressions

- [x] **Step 1: 运行所有单元测试**

Run: `npx vitest run`
Expected: 所有测试通过（包括新添加的附件测试）

- [x] **Step 2: 启动开发服务器验证**

Run: `npm run dev`
Expected: 应用正常启动，无编译错误

- [x] **Step 3: 手动测试 Excel 导入附件流程**

1. 打开应用，点击"导入 Excel"
2. 选择一个 Excel 文件
3. 展开"附件"折叠区域，上传一个 PDF/图片
4. 确认导入
5. 验证：记录列表中出现附件图标

- [x] **Step 4: 手动测试 OCR 导入附件流程**

1. 点击"导入报告"
2. 上传一个 PDF 报告
3. 确认"保留原始报告作为附件"已勾选
4. 确认导入
5. 验证：记录关联了附件

- [x] **Step 5: 手动测试附件预览和下载**

1. 在 RecordTable 中点击附件图标
2. 验证：预览对话框打开，显示文件内容
3. 点击下载按钮
4. 验证：浏览器下载文件

- [x] **Step 6: 手动测试删除记录保留附件**

1. 删除一条有附件的记录
2. 验证：附件仍然存在（可在其他记录中使用）

- [x] **Step 7: 手动测试删除附件清理引用**

1. 通过控制台调用 `deleteAttachment('att_id')`
2. 验证：关联记录的 attachmentId 被清除

- [x] **Step 8: Final Commit**

```bash
git add -A
git commit -m "feat(attachment): complete attachment import feature with tests"
```
