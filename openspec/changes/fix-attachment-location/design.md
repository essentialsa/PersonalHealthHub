## Context

附件上传功能已实现，但放置位置错误。当前在 ImportRecordsDialog（Excel 导入）中，用户期望在 AddRecordDialog（添加检验记录）中。

## Goals / Non-Goals

**Goals:**
- 将附件上传移动到 AddRecordDialog
- 保持现有功能不变

**Non-Goals:**
- 不改变附件存储逻辑
- 不改变预览/下载功能

## Decisions

### 1. 修改 AddRecordDialog

在 AddRecordDialog 中添加：
- `onAddAttachment` prop
- 可折叠的附件上传区域
- 提交时创建附件并关联到记录

### 2. 清理 ImportRecordsDialog

移除 ImportRecordsDialog 中的：
- `onAddAttachment` prop
- 附件状态和文件处理
- 可折叠附件区域 UI

## Risks / Trade-offs

- 无重大风险，只是 UI 位置调整
