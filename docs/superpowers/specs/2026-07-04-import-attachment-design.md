---
comet_change: import-attachment
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-04-import-attachment
status: final
---

# Import Attachment Design

## Overview

为检验指标导入流程新增附件支持，允许用户上传检查报告（如超声报告、PDF 报告等），附件可关联类别和日期，在查看界面可预览和下载。

## Architecture

### Data Flow

```
用户上传文件
    ↓
文件校验（格式、大小）
    ↓
转为 base64 data URL
    ↓
创建 HealthAttachment 对象
    ↓
存储到 localStorage (health_attachments_v1)
    ↓
HealthRecord.attachmentId 指向 HealthAttachment
```

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    App.tsx (State)                      │
│  - attachments: HealthAttachment[]                      │
│  - loadAttachments() / saveAttachments()                │
│  - addAttachment() / deleteAttachment()                 │
└─────────────────────────────────────────────────────────┘
         ↑                                    ↓
┌────────┴────────┐              ┌────────────┴────────────┐
│ ImportRecords   │              │    MedicalReport        │
│ Dialog          │              │    ImportDialog         │
│ (Excel Import)  │              │    (OCR Import)         │
│ - 折叠附件区域  │              │ - 保留原始报告选项      │
│ - 文件上传      │              │ - 文件上传              │
└─────────────────┘              └─────────────────────────┘
         ↓                                    ↓
┌─────────────────────────────────────────────────────────┐
│              RecordTable / RecordChart                  │
│  - 附件图标（回形针）                                    │
│  - 点击打开预览 Modal                                    │
│  - 下载按钮                                             │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│           AttachmentPreviewDialog                       │
│  - 居中 Modal（80% 屏幕宽度）                           │
│  - 图片：<img> 标签                                     │
│  - PDF：<iframe> 标签                                   │
│  - 下载按钮                                             │
└─────────────────────────────────────────────────────────┘
```

## Data Model

### HealthAttachment

```typescript
interface HealthAttachment {
  id: string;           // 唯一标识，格式：`${timestamp}_${random}`
  fileName: string;     // 原始文件名
  fileType: string;     // MIME 类型
  fileSize: number;     // 原始文件大小（字节）
  data: string;         // base64 data URL
  date: string;         // 关联日期
  categoryId?: string;  // 关联类别（可选）
  createdAt: string;    // 创建时间（ISO timestamp）
}
```

### HealthRecord (扩展)

```typescript
interface HealthRecord {
  id: string;
  date: string;
  indicatorType: string;
  value: number;
  unit: string;
  operationAt?: string;
  attachmentId?: string;  // 新增：关联附件 ID
}
```

## Implementation Details

### 1. Storage Layer (App.tsx)

```typescript
// 存储键
const ATTACHMENTS_KEY = 'health_attachments_v1';

// 加载附件
const loadAttachments = (): HealthAttachment[] => {
  const data = localStorage.getItem(ATTACHMENTS_KEY);
  return data ? JSON.parse(data) : [];
};

// 保存附件
const saveAttachments = (attachments: HealthAttachment[]) => {
  localStorage.setItem(ATTACHMENTS_KEY, JSON.stringify(attachments));
};

// 添加附件
const addAttachment = (attachment: HealthAttachment): boolean => {
  const attachments = loadAttachments();
  const totalSize = attachments.reduce((sum, a) => sum + a.fileSize, 0);
  
  // 校验单文件大小
  if (attachment.fileSize > 10 * 1024 * 1024) {
    return false; // 超过 10MB
  }
  
  // 校验总大小
  if (totalSize + attachment.fileSize > 20 * 1024 * 1024) {
    return false; // 超过 20MB
  }
  
  attachments.push(attachment);
  saveAttachments(attachments);
  return true;
};

// 删除附件
const deleteAttachment = (attachmentId: string) => {
  const attachments = loadAttachments();
  const filtered = attachments.filter(a => a.id !== attachmentId);
  saveAttachments(filtered);
  
  // 级联更新 HealthRecord
  const records = loadRecords();
  const updated = records.map(r => 
    r.attachmentId === attachmentId ? { ...r, attachmentId: undefined } : r
  );
  saveRecords(updated);
};
```

### 2. File Validation

```typescript
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const validateFile = (file: File): { valid: boolean; error?: string } => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: '不支持的文件类型，请上传图片或 PDF' };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` };
  }
  return { valid: true };
};
```

### 3. Import Integration

#### Excel Import (ImportRecordsDialog)

在对话框底部添加可折叠区域：

```tsx
<Collapsible>
  <CollapsibleTrigger>
    <Paperclip className="h-4 w-4" />
    附件（可选）
  </CollapsibleTrigger>
  <CollapsibleContent>
    <FileUploadZone
      onFileSelect={handleFileSelect}
      onFileRemove={handleFileRemove}
      acceptedTypes={ALLOWED_TYPES}
      maxSize={MAX_FILE_SIZE}
    />
  </CollapsibleContent>
</Collapsible>
```

#### OCR Import (MedicalReportImportDialog)

在确认导入前添加"保留原始报告"复选框：

```tsx
<Checkbox
  id="retain-report"
  checked={retainReport}
  onCheckedChange={setRetainReport}
/>
<label htmlFor="retain-report">保留原始报告作为附件</label>
```

### 4. Preview Dialog

```tsx
const AttachmentPreviewDialog = ({ attachment, onClose }) => {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = attachment.data;
    link.download = attachment.fileName;
    link.click();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[80vw] h-[80vh]">
        <DialogHeader>
          <DialogTitle>{attachment.fileName}</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {attachment.fileType.startsWith('image/') ? (
            <img 
              src={attachment.data} 
              alt={attachment.fileName}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <iframe 
              src={attachment.data}
              className="w-full h-full border-0"
            />
          )}
        </div>
        
        <DialogFooter>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4" />
            下载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

### 5. RecordTable Integration

在操作列添加附件图标：

```tsx
{record.attachmentId && (
  <Button
    variant="ghost"
    size="icon"
    onClick={() => handleViewAttachment(record.attachmentId)}
  >
    <Paperclip className="h-4 w-4" />
  </Button>
)}
```

## Edge Cases

1. **文件读取失败**：FileReader 失败时显示错误提示
2. **localStorage 满**：捕获 QuotaExceededError，提示用户删除旧附件
3. **附件被其他记录引用**：删除记录时只移除 attachmentId，不删除附件
4. **孤立附件**：定期检测无引用的附件，提示用户清理
5. **PDF 预览失败**：iframe 无法加载时，显示下载按钮作为 fallback

## Testing Strategy

### Unit Tests

1. `validateFile()` - 文件类型和大小校验
2. `addAttachment()` - 附件添加和大小限制
3. `deleteAttachment()` - 附件删除和级联更新

### Manual Tests

1. Excel 导入时上传附件 → 验证附件关联
2. OCR 导入时保留报告 → 验证附件创建
3. RecordTable 中查看附件 → 验证预览 Modal
4. 下载附件 → 验证文件完整性
5. 删除记录 → 验证附件保留
6. 删除附件 → 验证记录更新
