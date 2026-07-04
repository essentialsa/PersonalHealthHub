# Comet Design Handoff

- Change: import-attachment
- Phase: design
- Mode: compact
- Context hash: 13982ec674f666d9d2db80dd138a7b4bb59b98b4034985c8e73d9209e13c51f2

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/import-attachment/proposal.md

- Source: openspec/changes/import-attachment/proposal.md
- Lines: 1-31
- SHA256: 3736b2424f1332d1a73caae1106a0dacd9b752d32a7017c603c98baa6f157329

```md
## Why

用户在导入检验指标时，经常需要同时上传检查报告（如超声报告、CT报告、体检报告等）。当前系统仅支持数值导入，无法保存原始报告文件。用户需要在查看指标时回溯原始报告，以便医生咨询或个人存档。

## What Changes

- 在 Excel 导入和 OCR 报告导入流程中新增附件上传功能
- 附件可关联类别和日期（与指标数值相同的维度）
- 在 RecordTable 和 RecordChart 查看界面新增"查看附件"按钮
- 支持附件预览（图片直接显示，PDF 内嵌预览）
- 支持附件下载到本地
- 附件存储在 localStorage 中（随整体状态同步）

## Capabilities

### New Capabilities

- `attachment-storage`: 附件的存储、检索、预览和下载能力，包括 localStorage 中的文件存储策略和大小限制处理
- `attachment-upload`: 在指标导入流程中集成附件上传 UI，支持 Excel 导入和 OCR 报告导入两个入口
- `attachment-view`: 在指标查看界面展示附件入口，支持预览和下载操作

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **前端组件**：ImportRecordsDialog、MedicalReportImportDialog、RecordTable、RecordChart、App.tsx
- **数据模型**：新增 HealthAttachment 类型，扩展 HealthRecord 关联附件能力
- **存储**：localStorage 新增附件数据键，单文件 ≤10MB，总附件 ≤20MB
- **依赖**：可能需要引入 pdf.js 用于 PDF 预览
```

## openspec/changes/import-attachment/design.md

- Source: openspec/changes/import-attachment/design.md
- Lines: 1-141
- SHA256: 9d48160e73bef74f3ca6d22cc18a1b67707aefc70688d96543d9407b444cd529

[TRUNCATED]

```md
## Context

PersonalHealthHub 是一个基于 React + TypeScript 的 SPA 应用，使用 localStorage 作为主要存储。当前检验指标导入支持 Excel/CSV 和 OCR 报告两种方式，但都只提取数值数据，不保留原始报告文件。用户需要在查看指标时回溯原始报告。

现有数据模型：
- `HealthRecord`: { id, date, indicatorType, value, unit, operationAt }
- `IndicatorCategory`: { id, name, code, enabled, order, items[] }
- `IndicatorItem`: { id, label, unit, code, referenceRange, aliases[], dataType, enabled, order }

## Goals / Non-Goals

**Goals:**
- 用户可在导入指标时上传附件（图片/PDF）
- 附件可关联类别和日期
- 在查看界面可预览和下载附件
- 附件随 localStorage 整体状态同步（Google Drive）

**Non-Goals:**
- 不改变现有数值导入逻辑
- 不引入后端文件存储
- 不支持视频/音频等非报告格式
- 不支持多文件批量上传（MVP 单文件）

## Decisions

### 1. 存储方案：localStorage + Base64

**选择**：将文件转为 base64 data URL 存储在 localStorage 中。

**理由**：
- 与现有架构一致（纯 localStorage，无后端）
- 实现简单，无需引入新依赖
- Google Drive 同步自动包含附件数据

**备选方案**：
- IndexedDB：更适合大文件，但增加复杂度，且与现有 localStorage 序列化逻辑不兼容
- 压缩存储：增加复杂度，收益有限

**约束**：
- 单文件最大 10MB（base64 编码后约 13.3MB）
- 总附件大小建议不超过 20MB
- 超出限制时提示用户

**大小限制依据**：
- 单张超声图片：~100 KB
- 医疗报告 PDF（含嵌入图片）：1-5 MB，复杂报告可达 10 MB
- X 光片导出：1-5 MB
- 10MB 上限可覆盖绝大多数医疗报告场景

### 2. 数据模型：独立附件表 + 记录关联

**选择**：新增 `HealthAttachment` 类型，HealthRecord 通过 `attachmentId` 字段关联。

```typescript
interface HealthAttachment {
  id: string;           // 唯一标识
  fileName: string;     // 原始文件名
  fileType: string;     // MIME 类型
  fileSize: number;     // 原始文件大小（字节）
  data: string;         // base64 data URL
  date: string;         // 关联日期
  categoryId?: string;  // 关联类别（可选）
  createdAt: string;    // 创建时间
}
```

**理由**：
- 附件独立存储，不影响现有 HealthRecord 结构
- 可选关联类别，灵活支持不同场景
- 一个附件可关联多条记录（如同一次检查的多个指标）

### 3. 支持的文件格式

**选择**：仅支持图片（JPEG/PNG/GIF/WEBP）和 PDF。

**理由**：
- 覆盖用户主要场景（超声报告、检查单、体检报告）
- 图片有原生浏览器支持
- PDF 可通过 iframe 内嵌预览，无需额外依赖
- 限制格式降低存储和预览复杂度
```

Full source: openspec/changes/import-attachment/design.md

## openspec/changes/import-attachment/tasks.md

- Source: openspec/changes/import-attachment/tasks.md
- Lines: 1-38
- SHA256: a1a3ab4d378f7b131cfcba43846aca334a2cafe65a21d15f30a7aadcec9f5ee9

```md
## 1. 数据模型与存储层

- [ ] 1.1 定义 HealthAttachment TypeScript 接口（id, fileName, fileType, fileSize, data, date, categoryId, createdAt）
- [ ] 1.2 在 App.tsx 中实现附件存储函数：loadAttachments、saveAttachments、addAttachment、deleteAttachment
- [ ] 1.3 扩展 HealthRecord 类型，添加可选 attachmentId 字段
- [ ] 1.4 实现附件大小校验逻辑（单文件 ≤10MB，总大小 ≤20MB）

## 2. Excel 导入附件集成

- [ ] 2.1 在 ImportRecordsDialog 中添加附件上传区域（文件选择、预览、移除）
- [ ] 2.2 实现文件类型和大小校验
- [ ] 2.3 在确认导入时创建 HealthAttachment 并关联到导入的 HealthRecord

## 3. OCR 报告导入附件集成

- [ ] 3.1 在 MedicalReportImportDialog 中添加"保留原始报告"选项
- [ ] 3.2 实现从上传文件创建 HealthAttachment 的逻辑
- [ ] 3.3 在确认导入时关联附件到导入的 HealthRecord

## 4. 查看界面附件展示

- [ ] 4.1 在 RecordTable 操作列添加附件图标（Paperclip），有附件时显示
- [ ] 4.2 在 RecordChart 数据点 tooltip 中添加附件图标
- [ ] 4.3 创建 AttachmentPreviewDialog 组件（支持图片和 PDF 预览）
- [ ] 4.4 实现附件下载功能（触发浏览器下载）

## 5. 附件管理

- [ ] 5.1 实现从记录中移除附件关联的功能
- [ ] 5.2 实现孤立附件检测和清理提示

## 6. 测试与验证

- [ ] 6.1 编写附件存储函数的单元测试
- [ ] 6.2 编写文件校验逻辑的单元测试
- [ ] 6.3 手动测试 Excel 导入附件流程
- [ ] 6.4 手动测试 OCR 导入附件流程
- [ ] 6.5 手动测试附件预览和下载功能
```

## openspec/changes/import-attachment/specs/attachment-storage/spec.md

- Source: openspec/changes/import-attachment/specs/attachment-storage/spec.md
- Lines: 1-53
- SHA256: 6cf3a247da83a5f7fdcfeffa1aa70e4e546b117b630e7abc1996e89629613635

```md
## ADDED Requirements

### Requirement: Attachment storage in localStorage
The system SHALL store health report attachments as base64 data URLs in localStorage under the key `health_attachments_v1`.

#### Scenario: Store attachment successfully
- **WHEN** user uploads a valid file (image or PDF, ≤10MB)
- **THEN** system creates a HealthAttachment object with id, fileName, fileType, fileSize, data (base64), date, categoryId, createdAt
- **AND** stores it in localStorage under `health_attachments_v1`

#### Scenario: File exceeds size limit
- **WHEN** user uploads a file larger than 10MB
- **THEN** system displays an error message indicating the file size limit
- **AND** does not store the file

#### Scenario: Invalid file type
- **WHEN** user uploads a file that is not JPEG, PNG, GIF, WEBP, or PDF
- **THEN** system displays an error message indicating unsupported file type
- **AND** does not store the file

### Requirement: Attachment retrieval
The system SHALL retrieve attachments by id or by date/category criteria.

#### Scenario: Retrieve attachment by id
- **WHEN** system needs to display an attachment with a known id
- **THEN** system returns the full HealthAttachment object including base64 data

#### Scenario: Retrieve attachments by date range
- **WHEN** system needs to list attachments for a specific date or date range
- **THEN** system returns all matching HealthAttachment objects

#### Scenario: Retrieve attachments by category
- **WHEN** system needs to list attachments for a specific category
- **THEN** system returns all HealthAttachment objects with matching categoryId

### Requirement: Attachment deletion
The system SHALL allow deletion of attachments and cascade to associated records.

#### Scenario: Delete attachment
- **WHEN** user deletes an attachment
- **THEN** system removes the HealthAttachment from localStorage
- **AND** removes the attachmentId reference from all associated HealthRecord objects

### Requirement: Attachment size management
The system SHALL track total attachment storage usage and warn when approaching limits.

#### Scenario: Check storage usage
- **WHEN** system calculates total size of all stored attachments
- **THEN** system returns the total size in bytes

#### Scenario: Storage approaching limit
- **WHEN** total attachment size exceeds 20MB
- **THEN** system displays a warning recommending the user delete old attachments
```

## openspec/changes/import-attachment/specs/attachment-upload/spec.md

- Source: openspec/changes/import-attachment/specs/attachment-upload/spec.md
- Lines: 1-42
- SHA256: 2e0fa927510526fd214720b3be918aecf83973db8a9a5f8512161f13a9ec2839

```md
## ADDED Requirements

### Requirement: Attachment upload in Excel import
The ImportRecordsDialog SHALL provide an optional file upload zone for attaching a report file.

#### Scenario: Upload attachment during Excel import
- **WHEN** user opens ImportRecordsDialog and selects a file in the attachment upload zone
- **THEN** system validates the file type and size
- **AND** displays a preview of the selected file
- **AND** associates the attachment with the imported records upon confirmation

#### Scenario: Skip attachment upload
- **WHEN** user does not select a file in the attachment upload zone
- **THEN** system proceeds with import without creating an attachment

#### Scenario: Change selected attachment
- **WHEN** user has selected a file and selects a different file
- **THEN** system replaces the previously selected file with the new one

### Requirement: Attachment upload in OCR report import
The MedicalReportImportDialog SHALL provide an option to retain the uploaded report as an attachment.

#### Scenario: Retain report as attachment
- **WHEN** user uploads a PDF/image for OCR processing and opts to retain it
- **THEN** system creates a HealthAttachment from the uploaded file
- **AND** associates it with the imported records

#### Scenario: Discard report after OCR
- **WHEN** user opts not to retain the uploaded report
- **THEN** system processes the OCR but does not store the original file

### Requirement: Attachment association with records
The system SHALL associate uploaded attachments with the HealthRecord objects created during import.

#### Scenario: Single attachment to multiple records
- **WHEN** user imports multiple indicators from one report with an attachment
- **THEN** all imported HealthRecord objects reference the same HealthAttachment id

#### Scenario: Attachment metadata
- **WHEN** system creates a HealthAttachment during import
- **THEN** the attachment's date SHALL match the import date
- **AND** the attachment's categoryId SHALL match the selected import category (if applicable)
```

## openspec/changes/import-attachment/specs/attachment-view/spec.md

- Source: openspec/changes/import-attachment/specs/attachment-view/spec.md
- Lines: 1-50
- SHA256: 379b306151ffe7c4424c9ff0411325c3cf09eb98595b4513c298c3700f56a6e9

```md
## ADDED Requirements

### Requirement: Attachment indicator in record view
The RecordTable and RecordChart components SHALL display an attachment icon for records that have associated attachments.

#### Scenario: Show attachment icon
- **WHEN** a HealthRecord has a non-null attachmentId
- **THEN** system displays a Paperclip icon in the record's action area

#### Scenario: No attachment icon
- **WHEN** a HealthRecord has no attachmentId
- **THEN** system does not display the attachment icon

### Requirement: Attachment preview
The system SHALL provide a modal dialog for previewing attachments.

#### Scenario: Preview image attachment
- **WHEN** user clicks the attachment icon on a record with an image attachment
- **THEN** system opens a modal displaying the image at full size (with scroll if larger than viewport)

#### Scenario: Preview PDF attachment
- **WHEN** user clicks the attachment icon on a record with a PDF attachment
- **THEN** system opens a modal displaying the PDF via iframe

#### Scenario: Close preview
- **WHEN** user clicks the close button or outside the modal
- **THEN** system closes the preview modal

### Requirement: Attachment download
The system SHALL allow users to download attachments to their local device.

#### Scenario: Download attachment
- **WHEN** user clicks the download button in the preview modal
- **THEN** system triggers a browser download of the original file with its original filename

#### Scenario: Download from record list
- **WHEN** user clicks a download action on a record with an attachment
- **THEN** system triggers a browser download of the associated attachment

### Requirement: Attachment management in record view
The system SHALL allow users to remove attachment associations from records.

#### Scenario: Remove attachment from record
- **WHEN** user selects "remove attachment" on a record
- **THEN** system removes the attachmentId from the HealthRecord
- **AND** the HealthAttachment remains in storage (may be referenced by other records)

#### Scenario: Delete orphaned attachment
- **WHEN** an attachment has no remaining associated records
- **THEN** system may offer to delete the orphaned attachment to free storage
```

