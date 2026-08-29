# Outcome

体检报告 OCR 导入不再依赖 PaddleOCR 重后端：图片直发多模态模型（GLM-4V-Flash）输出结构化指标，后端退化为薄代理，冷启动分钟级失败成为历史。范围严格继承父级 Supervisor Change（healthhub-product-upgrade）已确认的 ocr-multimodal-import 能力规格。

# Scope

- report-parser 后端：`POST /api/parse` 接收 PDF/JPG/PNG，PDF 转页面图片后直发多模态模型，输出结构化指标 JSON
- 模型调用参数全部环境变量配置（base URL、模型名、API key、备选模型）
- 移除 PaddleOCR、本地表格还原、规则解析 fallback
- 保留健康检查端点语义；失败/超时返回明确错误码与中文错误信息
- 前端：指标匹配/置信度/导入确认流程不变，多端点重试保留，失败时有降级引导

## Source coverage

需求来源为父级 Supervisor Change 已确认的 specs/ocr-multimodal-import/spec.md 与 brief 决策 D6/D7，已完整映射至本 change 的 spec 与验收 A1-A6（对应父级 A5-A6），覆盖状态 complete。

# Non-goals

- 前端指标匹配/置信度/确认流程不重构（保留现有行为）
- 不删除 report-parser 服务本身（保留为薄代理 + 健康检查）
- 不做本地 OCR 兜底（用户接受直发第三方 API）

# Acceptance examples

- A1（父 A5）OCR 模型切换：报告图片由多模态模型直接识别输出结构化 JSON；模型名、base URL、API key 全部为环境变量配置；后端不含 PaddleOCR
- A2（父 A6）OCR 可靠性：正常网络下报告导入在 30 秒内返回；失败时前端给出明确失败状态与降级引导（手动录入/Excel 导入/照片挂附件），不出现无限 loading
- A3 `POST /api/parse` 接收报告文件（PDF/JPG/PNG），PDF 首先转为页面图片
- A4 模型调用失败/超时返回明确错误码与中文可读错误信息
- A5 保留 /api/health、/api/healthz、/api/ocr-readyz 健康检查语义
- A6 前端多端点重试机制 VITE_REPORT_PARSER_URLS 与导入确认流程保留不变

# Constraints and invariants

- API key 只存在于后端环境变量，不进前端、不进代码仓库
- 报告照片直发第三方大模型 API 已获用户确认
- 用户可见文案全部中文

# Decisions

- 继承父级 D6：删除 PaddleOCR 依赖与本地规则解析 fallback，后端为"转发 + 拼 prompt + 校验 JSON"薄代理；GLM-4V-Flash 主力、Qwen-VL 备选，OpenAI 兼容接口
- 继承父级 D7：报告照片直发第三方大模型 API
- 实现选择：保留 FastAPI 壳与 /api/parse 契约（前端零改动或极小改动），替换解析引擎为多模态模型调用；PDF→图片用 PyMuPDF（轻量、无 Paddle 依赖）

# Open questions

（无——范围严格继承父级已确认 Shape。）

# Verification expectations

- report-parser 单测：薄代理请求构造、响应校验、错误分支（可 mock 模型 API）
- 用真实体检报告照片实测识别质量（对照体检数据样例指标）
