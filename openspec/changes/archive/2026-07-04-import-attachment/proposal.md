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
