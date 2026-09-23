## Context

当前解析链路：前端（`medicalReport.ts` 多端点降级，240s 超时）→ Vercel Serverless（`api/report-parser.py` 挂载 FastAPI）→ `vision_engine.py`（glm-4v-flash 逐页串行，每次调用 timeout 60s，输出上限 1024 tokens）→ 前端 `resolveIndicators` 分类 → 预览确认入库。附件存储在 localStorage，登录态下所有业务键带 `__userId` 后缀（App.tsx `buildUserStorageKey`），但 `attachment.ts` 的孤立附件清理硬编码读 `health_records_v1`（无后缀）。详见 proposal.md 的 Why 与评审文档。

约束：全免费部署（Vercel Hobby maxDuration 60s、智谱免费模型并发受限）、单人维护、无新增付费服务。

## Goals / Non-Goals

**Goals:**
- P0/P1 全部条目以最小侵入改动落地，不改变现有架构形态（仍为单 FastAPI 函数 + 前端规则匹配）
- 每项修复有对应测试（前端 vitest / 后端 pytest mock）

**Non-Goals:**
- 前端逐页并发调用解析端点（更大改动，留待后续；本设计用服务端 deadline 达成时限目标）
- `handleCategoryConfirm` 空壳的实现/删除（P2）
- 数据加密升级、App.tsx 拆分、IndexedDB 迁移（P2）
- 历史附件数据迁移（键修复后新旧数据行为兼容，无需迁移）

## Decisions

### D1. 附件存储键修复：参数注入而非模块全局
`attachment.ts` 中读记录键的函数（孤立清理相关）增加可选参数 `recordsStorageKey`（默认 `'health_records_v1'` 保持向后兼容），由 App.tsx 调用时传入 `buildUserStorageKey(STORAGE_KEY, activeUserId)`。
- 备选：模块级 setter 注入 activeUserId —— 引入隐式全局状态，测试困难，弃用。
- 备选：把清理逻辑整体搬到 App.tsx —— 改动面大且违背服务层封装，弃用。

### D2. 大小限额：解析上限与附件上限解耦
对话框保留 50MB 解析上限（文件仅临时用于解析），但当用户勾选"保留报告为附件"且文件 > 10MB（`attachment.ts` 现行限额）时：导入前显示警告、`addAttachment` 失败时明确 toast"附件未保存"、记录不写入 attachmentId。
- 备选：把附件限额放宽到 50MB —— localStorage 配额（~5MB）根本放不下，弃用。

### D3. 导入去重：预览表内标记 + 默认跳过
新增共享工具 `findDuplicateRecords(incoming, existing)`：以 `(date, indicatorType, value)` 三元组比对。报告导入与 Excel 导入的预览表中，命中已有记录的行显示"疑似重复"徽标且默认不勾选；用户可手动勾选强制导入。满足 spec 中"警告 + 用户选择"的交互要求，且不需要打断式确认弹窗。
- 备选：导入时弹模态确认 —— 打断流程，且无法逐条区分，弃用。

### D4. PKCE S256：Web Crypto 计算 challenge
`code_challenge = base64url(SHA-256(verifier))`，用 `crypto.subtle.digest`（浏览器原生；Vercel HTTPS 与 localhost 均为 secure context）。仅影响新发起的授权，已存在的 token/会话不受影响。

### D5. 静默空结果：累计为空即显式失败
`vision_engine.py` 的 `parse()` 在所有页处理完后：累计（去重后）指标为空 → 抛 `VisionEngineError("未识别到任何指标，请检查图片清晰度或重试")`；单页为空但累计非空 → `logger.warning`（满足 spec 的"部分成功"场景）。现有"空文件/页面过小"前置拒绝逻辑保持不变。

### D6. 模型体系：主 DeepSeek V4.1 Flash，fallback GLM-4.6V-Flash（双 provider 配置）
- 主模型：`VISION_LLM_MODEL` 默认 `deepseek-flash`，`VISION_LLM_BASE_URL` 默认 `https://api.deepseek.com/v1`，凭证读 `VISION_LLM_API_KEY`（DeepSeek key）
- fallback：`VISION_LLM_FALLBACK_MODEL` 默认 `glm-4.6v-flash`，`VISION_LLM_FALLBACK_BASE_URL` 默认 `https://open.bigmodel.cn/api/paas/v4`，凭证读 `VISION_LLM_FALLBACK_API_KEY`（智谱 key；未设置时回落 `VISION_LLM_API_KEY`，兼容单 provider 双模型场景，如本地只用智谱 key 调试）
- `_resolve_max_output_tokens` 默认 8192（单页 40+ 指标 JSON 约 2-3K tokens，8K 充裕；glm-4.6v-flash 上限 32K 不受限；glm-4v-flash 若被显式使用仍限 1024）
- DeepSeek JSON mode（`response_format: json_object`）要求 prompt 中出现 "json" 字样：实现时确认/补充 USER_INSTRUCTION 文案（智谱无此要求，该改动对两家均安全）
- 图片入参两家均为 OpenAI 兼容 `image_url` + base64 data URL，现有请求构造无需分叉
- `label_matcher.py` 复用主模型（DeepSeek）做纯文本匹配，payload 极小、成本可忽略；健康检查/状态接口同步报告主备模型与凭证配置情况
- 备选：主备都留智谱 —— 按用户决策指定 DeepSeek 为主（原生多模态、按量计费无并发配额担忧，整本报告 ~¥0.04）

### D7. 服务端 deadline 预算：55s 软限
`parse()` 入口记录起始时间，单页 LLM 调用 timeout 由 60s 降为 15s；每次页循环前检查已耗时，超过 55s 软限的剩余页跳过并记 warning，已解析指标正常返回（部分成功）。最坏情形（6 页 × 15s）也控制在平台 60s 硬限内。
- 备选：`MAX_IMAGES_PER_REQUEST` 提到 2-3（多图单请求）—— glm-4.6v-flash 多图可靠性未验证（原代码注释明确因多图不可靠才设为 1），不在此变更冒险，弃用。
- 备选：前端逐页并发 —— 需要新端点契约（page 参数/聚合逻辑），Non-Goal。

### D8. 前端超时对齐与 abort
- `PARSE_TIMEOUT_MS` 240s → 65s（60s 平台限 + 5s 余量）；超时文案删除 Render 残留
- `fetchWithTimeout` 增加可选外部 `signal` 参数（与内部 timeout 的 AbortController 通过 `signal.addEventListener('abort')` 桥接）；Dialog 持有 `AbortController` ref：打开时创建，关闭/卸载时 `abort()`，解析与 match-labels 两类请求共用

### D9. 命名后重跑匹配：整表重跑 resolve
Dialog 保存 `extracted` 原始数组；用户对未命名指标改名（单个或整簇）时，更新对应 entry 的 `rawLabel` 后对全表重跑 `resolveIndicators(extracted, userCategories)` 并更新预览状态。命中用户库的条目转为 `action='import'`。
- 备选：单条增量匹配 —— 需要暴露 `matchUserIndicator` 的单条接口且边界情况（簇内其他条目）更复杂，整表重跑数据量小（≤200 条）无性能问题，弃用。

### D10. 4xx 降级链：仅 422 短路
`isRetryableStatus` 逻辑改为：422（参数校验错误，重试无意义）终止链，其余 4xx（400/401/403/429…）记录错误后继续下一端点；全部失败仍走现有聚合错误展示。

## Risks / Trade-offs

- [DeepSeek 主模型限流/超时] → 自动切换 fallback 智谱 glm-4.6v-flash（不同 provider，故障独立性更强）；D7 单页 timeout 收紧避免雪崩等待
- [智谱免费档并发低、fallback 也 429] → 两家尝试结果聚合进错误信息返回，引导用户稍后重试
- [DeepSeek JSON mode 要求 prompt 含 "json" 字样] → 实现时确认/补充 USER_INSTRUCTION 文案；4.4 端到端验证覆盖 JSON 解析路径
- [前端 65s 超时对慢网络偏紧] → 服务端 55s deadline 保证必有响应返回，65s 只是兜底
- [S256 依赖 crypto.subtle（secure context）] → 生产（Vercel HTTPS）与开发（localhost）均满足；不支持的环境本就无 OAuth 场景
- [附件键修复不迁移历史数据] → 未登录时期产生的孤立附件仍按无后缀键清理（默认参数保持旧行为），登录后的清理作用于正确作用域，无数据损坏风险
- [重跑 resolve 可能改变用户已手动调整的勾选状态] → 重跑仅更新匹配元数据（action/置信度/建议），保留用户对"是否导入"的既有勾选（新命中条目默认勾选，新降级条目默认取消）

## Migration Plan

1. 合并后在 Vercel 配置环境变量（用户自行操作）：

   | 变量 | 值 | 说明 |
   | --- | --- | --- |
   | `VISION_LLM_API_KEY` | DeepSeek API key | **必填**，替换原智谱 key（主模型凭证） |
   | `VISION_LLM_FALLBACK_API_KEY` | 智谱 API key | **必填**，把原 `VISION_LLM_API_KEY` 的值挪到这里 |
   | `VISION_LLM_MODEL` | （可不设） | 默认 `deepseek-flash` |
   | `VISION_LLM_BASE_URL` | （可不设） | 默认 `https://api.deepseek.com/v1` |
   | `VISION_LLM_FALLBACK_MODEL` | （可不设） | 默认 `glm-4.6v-flash` |
   | `VISION_LLM_FALLBACK_BASE_URL` | （可不设） | 默认 `https://open.bigmodel.cn/api/paas/v4` |

   若线上曾显式设置过 `VISION_LLM_MODEL` / `VISION_LLM_BASE_URL`，需移除以获得新默认值。
2. 部署后冒烟：`/api/health`（确认主备模型与凭证配置生效）+ 上传单页报告（主路径）+ 多页 PDF（deadline/部分成功路径）
3. 回滚：单次 revert 即可，无数据迁移、无 API 契约破坏（`/api/parse` 响应 schema 不变，仅空结果时从 `success:true` 变为 502/500 + error——该路径此前本就无有效产出）

## Open Questions

- Excel 导入（ImportRecordsDialog）的去重标记是否与报告导入共用同一组件渲染 —— 实现时按现有预览表结构就近复用即可，不影响契约
