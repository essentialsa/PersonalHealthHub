# 移动端阅读体验（mobile-reading）

## 目标行为

以 375px 视口宽度为验收基准（覆盖 iPhone SE/mini 类机型），在移动浏览器（含微信内置浏览器）中：

- **RecordTable**：数值列、参考范围箭头、高低颜色标识完整可读，无重叠、无横向溢出截断；表格在窄屏下保持对齐
- **RecordChart**：趋势图完整显示时间轴与指标图例；多指标场景下不挤压变形；详情表在窄屏可用
- **ConsultationBriefDialog（就诊摘要）**：摘要文本完整展示、可一键复制；复制结果与桌面端一致
- **附件预览**：图片/PDF 附件可在窄屏正常预览
- 上述走查中发现的问题按"针对性修复"原则处理，不引入全站响应式改造

## 约束

- 桌面端现有布局与交互不受影响（回归验证）
- 用户可见文案全部中文
- 修复限定在 RecordChart.tsx、RecordTable.tsx、ConsultationBriefDialog.tsx、AttachmentPreviewDialog.tsx 及必要样式文件
