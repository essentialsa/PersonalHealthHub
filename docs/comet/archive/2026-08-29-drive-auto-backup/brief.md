# Outcome

家人健康数据不再依赖手动操作即可安全备份：Google 授权一次后永久可用，记录变更自动上传 Drive，附件原件纳入备份，拉取云端数据前有覆盖保护。范围严格继承父级 Supervisor Change（healthhub-product-upgrade）已确认的 drive-backup 能力规格。

# Scope

- Google OAuth refresh token 持久化（一次授权，后续静默续期）
- 记录数据变更后防抖自动上传 Google Drive（默认开启，可关闭）
- 拉取保护：云端较新时提示后确认，不静默覆盖
- 附件以 Google Drive 为持久层、本地缓存用于离线查看，突破 localStorage 20MB 限制

## Source coverage

需求来源为父级 Supervisor Change `healthhub-product-upgrade` 已确认的 `specs/drive-backup/spec.md` 与 brief 决策 D2/D3/D4/D5，已完整映射至本 change 的 specs/drive-backup/spec.md 与验收 A1-A4，覆盖状态 complete。

# Non-goals

- 健康数据不迁移到任何数据库
- 不做冲突自动合并
- 不做坚果云等国内网盘接入（用户动机是授权麻烦，refresh token 方案已解决）
- 不加强 XOR 加密（已知可接受问题，父级 Non-goals 明确）

# Acceptance examples

- A1 授权持久化：首次 Google 授权后，refresh token 持久保存；此后重新打开应用，无需人工重新授权即可完成 Drive 上传/拉取
- A2 自动备份：记录数据发生变更后（增删改、导入），自动静默上传 Google Drive；提供开关，默认开启；家人无需任何手动操作
- A3 拉取保护：云端备份比本地新时，拉取前明确提示（显示两侧时间），不会静默覆盖本地
- A4 附件同步：附件（报告照片/PDF）随备份上传 Google Drive；从备份恢复后附件可用；附件总量不再受 localStorage 20MB 限制

# Constraints and invariants

- 健康数据与附件绝不写入任何数据库
- refresh token 按用户隔离存储（buildUserStorageKey 体系）
- 用户可见文案全部中文
- 不提交 .env 与健康数据样例文件

# Decisions

- 继承父级 D2：OAuth 加 access_type=offline&prompt=consent；已有 refresh token 的用户跳过授权页
- 继承父级 D3：数据变更后防抖静默上传，默认开启可关闭
- 继承父级 D4：附件以 Drive 为持久层，本地保留缓存；单文件上限 10MB 起步可配置
- 继承父级 D5：拉取前对比更新时间并提示，不自动合并

# Open questions

（无——范围严格继承父级已确认 Shape，用户已授权派发。）

# Verification expectations

- 单测：refresh token 存取与静默续期、防抖触发、拉取时间对比、附件元数据与恢复
- 手动验证路径：真机授权 → 刷新页面自动续期 → 录入数据自动上传 → 恢复备份后附件可用
