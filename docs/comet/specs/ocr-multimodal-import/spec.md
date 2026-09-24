# 多模态 OCR 导入（ocr-multimodal-import）

## 目标行为

### 后端（report-parser）

- `POST /api/parse` 接收报告文件（PDF/JPG/PNG），PDF 首先转为页面图片
- 图片直接提交给多模态大模型（默认 GLM-4V-Flash），由模型输出结构化指标 JSON（指标名、数值、单位、参考范围）
- 模型调用参数全部由环境变量配置：API base URL、模型名、API key、（可选）备选模型
- 不再包含 PaddleOCR 引擎、本地表格还原、本地规则解析 fallback；依赖列表相应精简
- 保留 `/api/health`、`/api/healthz`、`/api/ocr-readyz` 健康检查语义
- 模型调用失败/超时返回明确错误码与中文可读错误信息

### 前端（不变行为保持）

- 现有指标匹配（文本规范化 + 编辑距离 + 单位兼容打分）、三级置信度、未匹配"未命名"区、导入确认流程全部保留（medicalReport.ts）
- 现有多端点重试机制 `VITE_REPORT_PARSER_URLS`（云端优先、本地兜底）保留
- 正常网络下从提交到返回结果 ≤ 30 秒
- 失败时显示明确失败状态与降级引导：手动录入 / Excel 导入 / 将报告照片挂到记录附件；不出现无限 loading
- 文件选择与上传交互、支持格式（PDF/JPG/PNG）不变

## 约束

- API key 只存在于后端环境变量，不进前端、不进代码仓库
- 报告照片直发第三方大模型 API 已获用户确认
- 用户可见文案全部中文
