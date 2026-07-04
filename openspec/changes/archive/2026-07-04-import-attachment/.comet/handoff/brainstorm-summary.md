# Brainstorm Summary

- Change: import-attachment
- Date: 2026-07-04

## 确认的技术方案

### 存储方案
- localStorage + Base64 存储
- 单文件上限 10MB，总附件上限 20MB
- 文件格式：图片（JPEG/PNG/GIF/WEBP）和 PDF

### 数据模型
- 新增 HealthAttachment 类型：id, fileName, fileType, fileSize, data (base64), date, categoryId, createdAt
- HealthRecord 通过 attachmentId 关联附件
- 支持一个附件关联多条记录

### 关联模式
- 混合模式：默认每次导入一个附件，支持单条记录独立附件

### UI 交互
1. 导入对话框：底部可折叠"附件"区域
2. RecordTable：操作列回形针图标
3. 预览 Modal：居中（80% 屏幕宽度），支持图片和 PDF
4. 下载：直接触发浏览器下载

## 关键取舍与风险

- **localStorage 限制**：10MB 上限覆盖绝大多数医疗报告，超出需提示用户
- **Base64 膨胀**：文件大小增加约 33%，可接受
- **PDF 预览兼容性**：部分浏览器可能不支持 iframe 加载 data URL PDF，作为 fallback 提供下载按钮
- **性能影响**：大量附件可能影响 localStorage 读写性能，MVP 阶段暂不优化

## 测试策略

- 单元测试：存储函数、文件校验逻辑
- 手动测试：Excel 导入附件、OCR 导入附件、预览和下载

## Spec Patch

无（现有 delta spec 已足够）
