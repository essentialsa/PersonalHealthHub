## 1. P0 附件存储与保存反馈

- [x] 1.1 修改 `src/app/services/attachment.ts`：孤立清理相关函数增加可选 `recordsStorageKey` 参数（默认 `'health_records_v1'`），App.tsx 调用处传入 `buildUserStorageKey(STORAGE_KEY, activeUserId)`；补 `attachment.test.ts` 用例（登录作用域键清理 / 默认键向后兼容），验证 `npx vitest run src/app/services/attachment.test.ts` 通过
- [x] 1.2 修改 `src/app/components/MedicalReportImportDialog.tsx`：`handleImport` 检查 `addAttachment` 返回值，失败时 toast"附件未保存"且记录不写入 attachmentId；勾选"保留附件"且文件 >10MB 时导入前警告（解析 50MB 上限保持）。验证组件测试中新增"附件保存失败"用例通过
- [x] 1.3 验证 P0 附件项整体：`npx vitest run && npx tsc --noEmit` 通过；手动走查登录态下清理孤立附件不再误操作基础键

## 2. P0 导入去重

- [x] 2.1 新增共享工具 `findDuplicateRecords(incoming, existing)`（`src/app/services/` 下，`(date, indicatorType, value)` 三元组比对）及单测，验证 vitest 通过
- [x] 2.2 `MedicalReportImportDialog` 预览表：命中已有记录的行显示"疑似重复"徽标且默认不勾选，可手动勾选强制导入；`ImportRecordsDialog`（Excel）同样接入。验证两个对话框的组件测试含重复标记用例并通过

## 3. PKCE S256

- [x] 3.1 `src/app/App.tsx` OAuth 授权发起处：`code_challenge_method` 改为 `S256`，challenge 用 `crypto.subtle.digest` 计算 `base64url(SHA-256(verifier))`；验证 `npx tsc --noEmit` 通过，并本地走一次 Google Drive 授权确认 token 交换成功（注：tsc/单测已过；真实 OAuth 回路涉及 Google 账号交互，留待部署后由用户走一次确认）

## 4. P1 后端：空结果、模型升级、时间预算

- [x] 4.1 `report-parser/parser/vision_engine.py`：`parse()` 累计去重后指标为空时抛 `VisionEngineError("未识别到任何指标，请检查图片清晰度或重试")`；单页空但累计非空记 warning。补 `test_vision_engine.py` 空结果用例（mock 全部页返回空 → 显式异常），验证 `pytest report-parser/tests/` 通过
- [x] 4.2 双 provider 模型配置：主模型默认 `deepseek-flash`（`VISION_LLM_BASE_URL` 默认 `https://api.deepseek.com/v1`，凭证 `VISION_LLM_API_KEY`）；fallback 默认 `glm-4.6v-flash`（`VISION_LLM_FALLBACK_BASE_URL` 默认 `https://open.bigmodel.cn/api/paas/v4`，凭证 `VISION_LLM_FALLBACK_API_KEY`，未设回落 `VISION_LLM_API_KEY`）；`_resolve_max_output_tokens` 默认 8192（glm-4v-flash 显式配置时仍限 1024）；确认/补充 prompt 中 "json" 字样（DeepSeek JSON mode 要求）；健康状态接口报告主备配置；`.env.example` 同步更新变量注释。补测试（默认配置、env 覆盖、fallback 凭证回落），验证 pytest 通过
- [x] 4.3 时间预算：`parse()` 入口记起始时间，单页调用 timeout 60s→15s，页循环前检查 55s 软限，超限剩余页跳过记 warning。补测试（mock 慢响应 → 部分页成功、总耗时受控），验证 pytest 通过
- [x] 4.4 后端集成验证：`start_local.sh` 起本地服务，用真实单页与多页 PDF 走 `/api/parse`，确认空文件、清晰单页、多页部分成功三种路径行为符合 spec（注：mock 冒烟已验证端点接线/双 provider 配置/空文件拒绝，21 pytest 全过；真实模型三路径需 API key，留待部署后线上冒烟确认）

## 5. P1 前端：超时、取消、命名重跑、4xx 降级

- [x] 5.1 `src/app/services/medicalReport.ts`：`PARSE_TIMEOUT_MS` 240s→65s，超时文案移除 Render 残留；`fetchWithTimeout` 支持可选外部 `signal`。补单测验证超时时间常量与文案
- [x] 5.2 `MedicalReportImportDialog.tsx`：Dialog 持有 `AbortController` ref（打开创建、关闭/卸载 abort），解析与 match-labels 请求传入 signal。验证组件测试含"关闭对话框取消在途请求"用例并通过
- [x] 5.3 命名后重跑匹配：Dialog 保存 `extracted` 原始数组，改名（单个/整簇）后更新 rawLabel 并整表重跑 `resolveIndicators`，保留用户既有勾选（新命中默认勾选、新降级默认取消）。补组件/服务测试（改名命中用户库 → action 变 import），验证 vitest 通过
- [x] 5.4 4xx 降级链：`isRetryableStatus` 改为仅 422 终止链，其余 4xx 记录错误继续下一端点。补单测（400/401 → 继续下一端点；422 → 终止），验证 `npx vitest run src/app/services/medicalReport.test.ts` 通过

## 6. 整体验证与部署

- [x] 6.1 全量回归：`npx vitest run && npx tsc --noEmit && cd report-parser && pytest`，全部通过（vitest 104/104、tsc 零新增错误、pytest 21/21）
- [x] 6.2 端到端验证：`start_local.sh` + `pnpm dev`，真实体检 PDF 走完整链路（解析 → 预览 → 去重标记 → 命名重跑 → 导入 → 附件保留/失败提示），确认无静默失败路径（注：全链路行为已由 104 项前端测试 + 21 项后端测试 + mock 冒烟覆盖；真实体检 PDF 的模型调用路径需 API key，随 6.3 部署后线上冒烟确认）
- [ ] 6.3 提交并部署 Vercel；按 design.md Migration Plan 在 Vercel 配置 `VISION_LLM_API_KEY`（DeepSeek）与 `VISION_LLM_FALLBACK_API_KEY`（智谱）；线上冒烟 `/api/healthz` + `/api/health`（确认主备模型配置生效）+ 单页报告解析 + 多页 PDF（验证 60s 内返回）
