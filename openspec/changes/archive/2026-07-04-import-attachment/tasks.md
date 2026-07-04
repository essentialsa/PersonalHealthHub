## 1. 数据模型与存储层

- [x] 1.1 定义 HealthAttachment TypeScript 接口（id, fileName, fileType, fileSize, data, date, categoryId, createdAt）
- [x] 1.2 在 App.tsx 中实现附件存储函数：loadAttachments、saveAttachments、addAttachment、deleteAttachment
- [x] 1.3 扩展 HealthRecord 类型，添加可选 attachmentId 字段
- [x] 1.4 实现附件大小校验逻辑（单文件 ≤10MB，总大小 ≤20MB）

## 2. Excel 导入附件集成

- [x] 2.1 在 ImportRecordsDialog 中添加附件上传区域（文件选择、预览、移除）
- [x] 2.2 实现文件类型和大小校验
- [x] 2.3 在确认导入时创建 HealthAttachment 并关联到导入的 HealthRecord

## 3. OCR 报告导入附件集成

- [x] 3.1 在 MedicalReportImportDialog 中添加"保留原始报告"选项
- [x] 3.2 实现从上传文件创建 HealthAttachment 的逻辑
- [x] 3.3 在确认导入时关联附件到导入的 HealthRecord

## 4. 查看界面附件展示

- [x] 4.1 在 RecordTable 操作列添加附件图标（Paperclip），有附件时显示
- [x] 4.2 在 RecordChart 数据点 tooltip 中添加附件图标
- [x] 4.3 创建 AttachmentPreviewDialog 组件（支持图片和 PDF 预览）
- [x] 4.4 实现附件下载功能（触发浏览器下载）

## 5. 附件管理

- [x] 5.1 实现从记录中移除附件关联的功能
- [x] 5.2 实现孤立附件检测和清理提示

## 6. 测试与验证

- [x] 6.1 编写附件存储函数的单元测试
- [x] 6.2 编写文件校验逻辑的单元测试
- [x] 6.3 手动测试 Excel 导入附件流程
- [x] 6.4 手动测试 OCR 导入附件流程
- [x] 6.5 手动测试附件预览和下载功能
