## Why

附件上传按钮被错误地放置在 Excel 导入对话框中，用户期望它在"添加检验记录"对话框中。当用户手动添加单条检验记录时（如超声检查结果），需要同时上传检查报告附件。

## What Changes

- 将附件上传功能从 ImportRecordsDialog 移动到 AddRecordDialog
- 在 AddRecordDialog 中添加可折叠的附件上传区域
- 移除 ImportRecordsDialog 中的附件上传功能

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `attachment-upload`: 附件上传入口从 Excel 导入移动到添加检验记录

## Impact

- **前端组件**：AddRecordDialog、ImportRecordsDialog
