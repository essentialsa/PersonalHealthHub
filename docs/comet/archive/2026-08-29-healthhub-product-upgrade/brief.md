# Outcome

把 PersonalHealthHub 从"手动备份、易丢数据、OCR 冷启动失败"升级为"数据不丢、零操作备份、报告导入秒级响应、手机上能看"的家人可用私人健康数据工具。本 change 为 Supervisor Change，拆分为 3 个子 change 分别交付。

# Scope

三个子 change（相互独立，无真实先后依赖）：

1. **drive-auto-backup** — Drive 自动备份 + refresh token 持久化授权 + 附件纳入同步
2. **ocr-multimodal-import** — OCR 后端换 GLM-4V-Flash 多模态模型（薄代理架构）
3. **mobile-reading** — 移动端阅读体验验证与修复

## Source coverage

本次需求来源于本会话与用户的多轮产品决策（grill-me 澄清 + 选型调研），无外部文档来源。决策均已在本 brief 的 Decisions 与 specs/ 中完整表达：

- 用户原话"数据我不愿意放在 supabase，但我愿意放在谷歌云盘" → drive-backup spec
- 用户原话"主要是电脑和手机浏览器查看" → mobile-reading spec（手机阅读为一等场景）
- 用户原话"接受"（报告照片直发第三方大模型 API）→ ocr-multimodal-import spec
- 用户原话"单纯嫌麻烦"（授权问题动机）→ 只做 refresh token 持久化，不换国内云盘
- 选型结论"暂定 GLM-4V-Flash" → ocr-multimodal-import spec

# Non-goals

- 不把健康数据迁移到 Supabase 或任何数据库（用户明确拒绝）
- 不做冲突自动合并（使用模式是"电脑录入、手机查看"，轻量提示即可）
- 不做原生 App、不做全站响应式改造
- 不做大众产品化：注册引导、onboarding、多语言、隐私合规
- 不加强 XOR 加密 / 前端 OAuth Secret 安全性（自用工具可接受，已知问题记录在案）
- 不删除现有指标映射 + 置信度 + 导入确认流程（medicalReport.ts 前端逻辑保留）

# Acceptance examples

父级验收项（由 children.yaml 索引，子 change 各自覆盖）：

- A1 授权持久化：首次 Google 授权后，refresh token 持久保存；此后重新打开应用，无需人工重新授权即可完成 Drive 上传/拉取
- A2 自动备份：记录数据发生变更后（增删改、导入），自动静默上传 Google Drive；提供开关，默认开启；家人无需任何手动操作
- A3 拉取保护：云端备份比本地新时，拉取前明确提示（显示两侧时间），不会静默覆盖本地
- A4 附件同步：附件（报告照片/PDF）随备份上传 Google Drive；从备份恢复后附件可用；附件总量不再受 localStorage 20MB 限制
- A5 OCR 模型切换：报告图片由多模态模型直接识别输出结构化 JSON；模型名、base URL、API key 全部为环境变量配置；后端不含 PaddleOCR
- A6 OCR 可靠性：正常网络下报告导入在 30 秒内返回；失败时前端给出明确失败状态与降级引导（手动录入/Excel 导入/照片挂附件），不出现无限 loading
- A7 移动端可读：375px 宽度下 RecordTable/RecordChart 数据可读（数值、参考范围箭头、颜色不重叠不截断）、就诊摘要可完整展示并复制；微信内置浏览器打开正常；发现的问题修复并留有验证记录

# Constraints and invariants

- 健康数据（记录、指标分类、附件）只存本地 localStorage + Google Drive，绝不写入任何数据库
- 遵循 AGENTS.md：全部用户可见文案中文；不提交健康数据样例文件（体检数据_*.xlsx）、.env、agent 配置目录
- Google Drive 凭据（refresh token）按用户隔离存储（沿用 buildUserStorageKey 体系）
- OCR 请求仍经 report-parser 后端转发，API key 不进前端
- 现有多端点重试机制（VITE_REPORT_PARSER_URLS）保留
- 子 change 在独立 worktree 开发，逐一 merge 回本 change 分支（Runtime Supervisor 流程）

# Decisions

- D1 数据主权：本地为主 + Google Drive 备份；拒绝数据库（用户 2026-08-29 明确）
- D2 授权持久化：OAuth 加 `access_type=offline&prompt=consent` 拿 refresh token 存 localStorage；已有 token 的用户跳过授权页（规避重复授权不返回 refresh token 的坑）；不换坚果云等国内网盘（动机是嫌麻烦而非访问不了）
- D3 自动备份策略：数据变更后防抖静默上传，默认开启可关闭；沿用/扩展现有"导入后自动上传"开关（App.tsx:2390 一带）
- D4 附件存储升级：附件以 Google Drive 为持久层（本地保留缓存用于离线查看），突破 localStorage 20MB 总量限制；单文件大小上限维持 10MB 起步可调
- D5 冲突策略（轻量）：拉取前对比更新时间并提示，不自动合并
- D6 OCR 架构：删除 PaddleOCR 依赖与本地规则解析 fallback，后端退化为"转发 + 拼 prompt + 校验 JSON"薄代理；GLM-4V-Flash 为主力模型（完全免费不限量），Qwen-VL 为备选，全部走 OpenAI 兼容接口环境变量配置
- D7 隐私：报告照片直发第三方大模型 API（用户明确接受）
- D8 移动端：只做窄屏验证 + 针对性修复，不做全面响应式改造

# Open questions

（无——用户已于 2026-08-29 确认目标、子 change 划分、验收项与全部决策。）

# Verification expectations

- drive-auto-backup：单测（token 持久化、防抖触发、附件元数据）+ 手动验证（真机 Google 授权→刷新页面→自动上传成功）
- ocr-multimodal-import：report-parser 单测（薄代理请求/响应/错误）+ 用真实体检报告照片实测识别（对照 体检数据_*.xlsx 的指标）
- mobile-reading：375px 视口下 Playwright 截图 + 手动走查记录，问题修复前后对照
