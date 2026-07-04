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

### 4. 预览实现：Modal + iframe

**选择**：使用 shadcn/ui Dialog 组件作为预览容器，图片用 `<img>` 标签，PDF 用 `<iframe>` 标签。

**理由**：
- 与现有 UI 风格一致
- iframe 可直接加载 data URL，无需额外库
- 图片原生支持，PDF 通过浏览器内置 PDF 查看器

**备选方案**：
- pdf.js：功能更强，但增加 ~400KB 依赖，MVP 阶段不需要
- 新窗口打开：用户体验较差

### 5. 导入流程集成

**选择**：在 ImportRecordsDialog 和 MedicalReportImportDialog 底部增加附件上传区域。

**流程**：
1. 用户选择/上传文件
2. 文件校验（格式、大小）
3. 预览确认
4. 点击"确认导入"时，同时创建 HealthRecord 和 HealthAttachment
5. HealthRecord 的 attachmentId 指向新创建的 HealthAttachment

**理由**：
- 不改变现有导入流程的核心逻辑
- 附件上传是可选步骤，不影响纯数值导入
- 与 OCR 报告导入的"保留原始文件"语义一致

### 6. 查看界面集成

**选择**：在 RecordTable 的操作列和 RecordChart 的数据点 tooltip 中增加附件图标。

**交互**：
- 有附件的记录显示附件图标（Paperclip）
- 点击打开预览 Modal
- Modal 内提供下载按钮

**理由**：
- 图标不占用额外空间
- 与现有表格/图表布局兼容
- 用户可快速识别哪些记录有附件

## Risks / Trade-offs

- **[localStorage 大小限制]** → 设置单文件 10MB 上限，总附件 20MB 建议上限，超出时明确提示用户。现代浏览器 localStorage 通常有 5-10MB 限制，但附件数据可与其他数据分存。长期可考虑迁移到 IndexedDB。
- **[Base64 膨胀]** → 文件大小增加约 33%，10MB 文件编码后约 13.3MB，需注意 localStorage 总容量。
- **[PDF 预览兼容性]** → 部分浏览器可能不支持 iframe 加载 data URL PDF，作为 fallback 可提供下载按钮。
- **[性能影响]** → 大量附件可能影响 localStorage 读写性能，MVP 阶段用户量小，暂不优化。

## Migration Plan

- 无数据迁移需求，新功能完全向后兼容
- 现有 HealthRecord 无 attachmentId 字段，不影响现有数据显示
- localStorage 新增 `health_attachments_v1` 键

## Open Questions

- 是否需要在导出功能中支持导出附件？（MVP 不支持）
- 附件是否需要支持编辑/替换？（MVP 不支持，仅上传和删除）
