## Why

2026-09-23 对 main 分支的代码评审确认：数据正确性方面存在 5 个已核实的缺陷（多用户附件存储键错位、附件保存失败静默产生悬空 attachmentId、重复导入无去重、OAuth PKCE 使用 plain）；体检报告解析管线在迁移到 Vercel Serverless + GLM-4V-Flash 后仍有 4 条确定性风险路径（VLM 识别失败时静默返回空结果、多页串行调用超出 Vercel 60s 硬限、glm-4v-flash 1024 token 输出截断、429 无退避），导致整本年度体检报告（5-20 页）无法稳定解析入库。

## What Changes

**P0 数据正确性与安全：**
- 附件存储键按用户作用域隔离：`attachment.ts` 的记录键读取改为注入用户作用域键（与 App.tsx `buildUserStorageKey` 一致），修复登录用户下孤立附件清理失效
- 附件保存失败显式反馈：导入对话框检查 `addAttachment` 返回值，失败时提示"附件未保存"且不写入悬空 attachmentId；报告导入对话框与附件服务的文件大小限额统一
- 导入去重：同日期 + 同指标类型 + 同数值的记录在导入时识别并警告/跳过
- OAuth PKCE 从 `plain` 升级为 `S256`

**P1 解析管线加固：**
- 消除静默空结果：VLM 解析累计指标为空时返回 `success=false` 与可读错误，不再静默放行
- 主模型切换为 DeepSeek V4.1 Flash（`deepseek-flash`，原生多模态），fallback 为 GLM-4.6V-Flash；解析配置扩展为按 provider 独立的 base_url 与 API key（新增 `VISION_LLM_FALLBACK_BASE_URL` / `VISION_LLM_FALLBACK_API_KEY`），输出 token 上限提升至 8192，消除 1024 截断
- 超时对齐与并发：前端解析超时与 Vercel `maxDuration: 60s` 对齐（含分段预算），移除 Render 残留文案
- 关闭导入对话框时取消在途解析/二次匹配请求（AbortController 贯穿）
- 未命名指标命名后重跑 `resolveIndicators`，命中用户指标库即可导入（当前命名功能形同展示）
- 前端端点降级链修复：非 422 的 4xx 错误也继续尝试下一端点

## Capabilities

### New Capabilities
- `report-parsing`: 体检报告视觉解析管线的可靠性要求——空结果显式失败、模型与输出上限配置、服务端超时预算、请求取消、多端点降级策略
- `report-import`: 解析结果导入行为要求——重复记录识别、未命名指标命名后的重新匹配
- `auth`: 云同步 OAuth 授权安全要求——PKCE code challenge 必须使用 S256

### Modified Capabilities
- `attachment-storage`: 存储键要求变更为按用户作用域隔离（`__userId` 后缀），孤立附件清理必须在正确的用户作用域键上进行
- `attachment-upload`: 附件保存结果必须向调用方反馈；报告导入对话框与附件服务的文件大小限额必须一致，超限时不得产生悬空 attachmentId

## Impact

- **前端**：`src/app/services/attachment.ts`、`src/app/services/medicalReport.ts`、`src/app/components/MedicalReportImportDialog.tsx`、`src/app/App.tsx`（导入去重、PKCE、附件 props）
- **后端（Vercel Serverless）**：`report-parser/parser/vision_engine.py`（空结果判定、默认模型、超时预算）、`report-parser/main.py`（错误响应）
- **测试**：`report-parser/tests/test_vision_engine.py`（空结果场景）、`src/app/services/medicalReport.test.ts`（4xx 降级、命名重跑匹配）、`attachment.test.ts`（用户作用域键）
- **部署**：Vercel 环境变量需调整——`VISION_LLM_API_KEY` 换为 DeepSeek API key；新增 `VISION_LLM_FALLBACK_API_KEY`（填原智谱 key）；`VISION_LLM_BASE_URL` / `VISION_LLM_MODEL` / `VISION_LLM_FALLBACK_MODEL` / `VISION_LLM_FALLBACK_BASE_URL` 均有正确默认值可不设（详见 design.md Migration Plan）
- **不涉及**：UI 布局重构、数据加密升级、App.tsx 拆分（P2 范围）
