# 设计文档 — UI 侧边栏布局重构

## Context

现状（详见 proposal.md Why）：
- `src/app/App.tsx`（5571 行）单列布局：顶部渐变标题 + 9 按钮自动换行网格 + 3 张统计卡 + Radix 非受控 Tabs（`defaultValue="table"`，无受控状态）。
- 三个页签各有一套独立表格实现（数据列表透视表内联于 App.tsx L5341-5415、`RecordChart` 明细表、数据维护 `RecordTable`），配色类大量复制粘贴，全部硬编码 violet/blue/pink 系 Tailwind 类，基本不使用 theme.css 语义 token。
- 无搜索、无通知、无时间范围筛选、数据列表无分页；移动端仅靠零散响应式前缀。
- 设计稿 3 页（`design-ref/pages/数据列表.html`、`图表分析.html`、`数据维护.html`）为桌面端固定侧栏 + 顶栏 + 统计卡 + 胶囊页签的外壳，主色为青绿色系（不采用）。

用户已确认的三个决策：① 搜索框与铃铛做成真功能；② 数据维护页保留记录表格与变更记录（按设计稿视觉语言重排）；③ 移动端侧栏变抽屉。

## Goals / Non-Goals

**Goals:**
- 按 design-ref 重构外壳与三页布局，配色 100% 沿用现状（violet/blue/pink 渐变、毛玻璃、rose/emerald 状态色）。
- 既有功能零丢失：9 个工具栏入口、3 个页签全部行为、行内编辑/附件/恢复/云同步/导出日志等全部保留。
- 新增可用的全局搜索、通知中心、时间范围筛选、数据列表分页。
- 移动端（<1024px）抽屉式导航，功能与桌面一致。

**Non-Goals:**
- 不改任何后端/API/Supabase/解析器逻辑；不改业务数据结构与 localStorage 既有 key 约定。
- 不做 App.tsx 全面组件化拆分（LoginPage、CloudSyncDialog 等内联组件原样保留），仅抽出本设计新增的外壳组件。
- 不重设计登录页（设计稿未覆盖）。
- 不迁移到 theme.css 语义 token 体系（配色延续现状的类名写法，与现有代码习惯一致；token 迁移留待独立 change）。

## Decisions

1. **外壳组件抽取到 `src/app/components/shell/`**：新增 `AppSidebar.tsx`（logo + 分组导航 + 用户区）、`AppTopbar.tsx`（标题 + 菜单按钮 + 搜索框 + 通知铃铛 + 头像）、`AppNotifications.tsx`（通知下拉面板）、`StatsCards.tsx`。App.tsx 保留全部 state 与 handler，向 shell 组件传回调。
   - 备选：连同业务弹窗一起大拆 App.tsx —— 否决，回归风险过大且与本次目标无关。
2. **页签改受控**：App.tsx 新增 `activeTab: "list" | "chart" | "maintenance"`（默认 `list`），Radix Tabs 用 `value`/`onValueChange` 受控。原因：通知面板「查看全部」、移动端抽屉选中后跳转、侧边栏高亮都需要感知/切换页签；非受控无法联动。侧边栏数据管理组三项分别映射：添加检验记录/检验指标维护为动作，数据列表等页签项高亮跟随 `activeTab`。
3. **配色映射（设计稿 token → 现有配色）**：设计稿的 `--hc-primary` 青绿一律映射为现有 violet/blue 渐变体系。对照表：主按钮 `bg-gradient-to-r from-violet-500 to-blue-500`；页签激活同款渐变；侧边栏激活项 `bg-violet-100 text-violet-700`、hover `bg-violet-50`；卡片 `bg-white/60 backdrop-blur-xl border-0 shadow-xl shadow-violet-100/50`（毛玻璃，延续现状）；危险区/删除 rose 系；成功/同步 emerald 系；表头 `bg-violet-50/60`、行 hover `bg-violet-50/40`；图表轴/网格沿用现有 violet 系（#e9d5ff/#c4b5fd）与 8 色曲线 palette。布局类（间距 24/32px、圆角、卡片结构、图标块 48px）按设计稿尺寸。
4. **全局搜索**：App 级 `searchQuery` state 由顶栏持有并下发给当前页签。匹配范围：日期字符串、指标名称、数值文本（小写包含匹配）。数据列表过滤透视行、数据维护过滤传入 RecordTable 前的记录、图表分析过滤指标卡。数据量级为个人健康记录（数百条内），无需防抖/索引。
   - 备选：独立搜索结果页 —— 否决，交互重且设计稿明确是顶栏即时过滤。
5. **通知中心**：shadcn Popover 面板，数据源复用现有 `changeLog`（变更日志 state）最近 10 条（复用现有四色徽章）+ 云同步状态行（`autoSyncEnabled`/最后同步时间/`manualSyncing`）。底部「查看全部变更」→ 受控切到数据维护页签。空态文案「暂无变更记录」。
6. **数据列表分页**：客户端分页，每页 10 行（设计稿 4 行仅为示意排版），复用 RecordChart 明细表已有的分页交互模式（上一页/下一页 + 页码），切换分类或搜索词时重置第 1 页。
7. **图表分析页**：仍用 recharts，新建 `ChartAnalysisPage` 组件替换现 RecordChart 的图表部分（RecordChart 保留为参考/回退，不删除）。要点：
   - 时间范围 `timeRange: "7d" | "30d" | "90d" | "all"`，默认 `all`（设计稿示意 90天，但默认隐藏旧数据对存量用户不友好 —— 有意偏差，已记录）。
   - 分类选择沿用 RecordChart 现有 localStorage key（`health_chart_view`），保持用户已保存视图兼容。
   - 每指标一卡，两列网格；卡片图表类型按指标序号循环 [折线, 柱状, 面积]，复现设计稿三卡样式差异；徽章 = 区间内最新值 − 最早值（带单位）；摘要 = 最高/最低/平均/当前。
   - 雷达卡：≥3 个含最新值指标时显示；各指标最新值按区间 min-max 归一化到 0-100（复用 RecordChart 归一化思路），综合评分 = 归一化均值，最佳/待改善 = 最高/最低者；不足 3 个指标隐藏。
   - 曲线配色沿用现有 8 色 palette 与 violet 轴色。
8. **数据维护页**：新建 `DataMaintenancePage` 组件：2×2 启动卡（元信息：当前 N 个指标 / 支持 .xlsx, .csv / 附件 N 份（以附件数近似"已导入份数"，无来源字段，如实展示）/ 同步状态徽章）+ 危险区（复用现有 `ClearAllDataDialog` 确认流）+ 下方保留分类筛选 + `RecordTable` + 变更记录列表，表格与日志按卡片化样式重排但所有交互 handler 不变。
9. **移动端抽屉**：断点 1024px（Tailwind `lg`）。<lg 时隐藏侧边栏，顶栏左侧出现汉堡按钮，点击用 shadcn `Sheet`（左侧滑出）渲染与桌面相同的导航；选中导航项或点遮罩关闭。统计卡/卡片网格/表格区沿用 `grid-cols-1 lg:grid-cols-*` 堆叠。沿用现有 `mobile_walkthrough.cjs`（375px）走查验证。
10. **分支与验证**：开发在新分支 `feature/ui-sidebar-redesign` 进行；完成后跑 `npx vitest`、`tsc --noEmit`、逐按钮手工清单（见 tasks.md）与两份 Playwright 截图脚本比对。

## Risks / Trade-offs

- [5571 行 App.tsx 上动刀，回归面大] → 只做"外壳抽出 + 布局重排"，不碰 handler 内部逻辑；既有单测（App.export.test.tsx 9 例 + MedicalReportImportDialog 9 例）必须全绿；tasks.md 逐按钮验证清单兜底。
- [受控 Tabs 改变 DOM/选择器] → 保留 `data-[state=active]` 语义并更新受影响测试选择器；e2e 截图脚本在新分支上重跑比对。
- [搜索/通知是新增真功能，可能被误认为纯装饰] → 面板与过滤均有空态文案与可见反馈；tasks.md 中有专项验证项。
- [雷达归一化跨单位指标（如 mmol/L 与 kg）同图对比可能引起误读] → 卡片注明「归一化对比」，仅作趋势参考；指标 <3 时隐藏。
- [时间范围默认「全部」与设计稿示意「90天」不同] → 有意偏差：避免老用户打开图表页突然"少数据"；用户可一键切 90天。
- [设计稿侧栏在内容超长时（变更日志 50 条）页面高度大] → 侧边栏 `fixed` + 内容区独立滚动，顶栏 sticky，与设计稿一致。
- [RecordChart 内联明细表与新图表页功能重叠] → 本次直接以新图表页替代其图表区与明细表入口（编辑/删除能力在数据维护页 RecordTable 全量保留，明细表按日期整行删除的能力在 RecordTable 中仍可逐记录完成）；RecordChart 文件暂不删除，降低回滚成本。

## Migration Plan

1. `git checkout -b feature/ui-sidebar-redesign`。
2. 先落 shell 组件（侧边栏/顶栏/统计卡/受控页签），旧工具栏网格移除 —— 此提交后应用已可用、功能完整。
3. 逐页签迁移：数据列表（分页）→ 数据维护（启动卡 + 保留表格/日志）→ 图表分析（新组件）。
4. 全局搜索与通知中心接入。
5. 移动端抽屉与响应式收尾。
6. 测试与截图比对，PR 合并。回滚策略：整分支单 PR，revert 即回滚；RecordChart 保留未删，图表页可独立退回。

## Open Questions

（无 — 材料性决策均已与用户确认或已在 Decisions 中记录为有意偏差。）

## 遗漏评估（任务 1.2，开发前逐项核对）

| # | 现有功能/入口 | 原位置 | 新设计落点 | 结论 |
|---|---|---|---|---|
| 1 | 添加检验记录（AddRecordDialog，含附件上传） | 工具栏 1 | 侧边栏·数据管理；移动端抽屉同项 | ✅ 保留 |
| 2 | 检验指标维护（IndicatorMaintenanceDialog：分类/指标增删改、变更历史） | 工具栏 2 | 侧边栏·数据管理；维护页卡片「管理指标」 | ✅ 保留 |
| 3 | 报告导入（MedicalReportImportDialog） | 工具栏 3 | 侧边栏·报告；维护页卡片「导入报告」 | ✅ 保留 |
| 4 | 问诊简报（ConsultationBriefDialog） | 工具栏 4 | 侧边栏·报告 | ✅ 保留 |
| 5 | Excel 导入（ImportRecordsDialog） | 工具栏 5 | 侧边栏·工具；维护页卡片「导入Excel」 | ✅ 保留 |
| 6 | 导出 Excel（ExportDialog，含导出日志） | 工具栏 6 | 侧边栏·工具；维护页卡片「导出Excel」 | ✅ 保留 |
| 7 | 云同步弹窗（基础设置/授权管理/从云端同步/admin PIN） | 工具栏 7 | 侧边栏·同步·云同步 | ✅ 保留 |
| 8 | 立即同步（handleManualSync） | 工具栏 8 | 侧边栏·同步；维护页卡片 4 | ✅ 保留 |
| 9 | 删除全部（ClearAllDataDialog 确认流） | 工具栏 9 | 侧边栏·危险操作；维护页危险区 | ✅ 保留 |
| 10 | 用户菜单（邮箱/设置登录密码/退出登录，仅认证启用时） | 页头右上 | 顶栏头像 + 侧边栏底部用户区 | ✅ 保留 |
| 11 | 统计卡片 ×3（总记录数/指标种类/最后更新） | 主内容顶部 | 保留 + 新增趋势徽章（本月新增/覆盖类别/距今天数） | ✅ 保留增强 |
| 12 | 数据列表透视表 + 分类选择（indicatorDataCategoryId） | 表格页签 | 保留 + 新增分页 + 搜索过滤 | ✅ 保留增强 |
| 13 | RecordChart（单折线图 + 图例开关 + 指标明细表行内编辑/整行删除/分页） | 图表页签 | 新图表卡片网格 + 雷达卡承接可视化；明细表编辑/删除能力由维护页 RecordTable 等价承接（整行删除→逐记录删除）；RecordChart 文件保留不删以便回退 | ✅ 有意整合（已记录） |
| 14 | 维护页 RecordTable（行内编辑/删除/新增后续/附件上传预览替换移除/参考范围徽章） | 维护页签 | 启动卡下方原样保留 | ✅ 保留 |
| 15 | 变更记录列表 + 恢复（handleRestoreFromLog） | 维护页签 | 保留 + 通知中心复用其数据 | ✅ 保留 |
| 16 | localStorage key 约定（health_records_v1 等 8 个 + health_chart_view） | 全局 | 全部不变；图表页沿用 health_chart_view | ✅ 不变 |
| 17 | 撤销/恢复栈（historyStack/futureStack，当前无 UI 入口） | state | state 原样保留 | ✅ 不变 |
| 18 | 附件预览 AttachmentPreviewDialog（全局） | 根组件 | 保留 | ✅ 不变 |
| 19 | 登录页 LoginPage | 认证门控 | 不在本次设计稿范围，保持原样 | ✅ 范围外 |
| 20 | （新增）搜索/通知铃铛/时间范围筛选/数据列表分页 | 无 | 顶栏搜索、通知面板、图表页时间范围、列表分页 — 均为真功能 | ✅ 新增 |

**核对结论**：现有功能在新设计中全部有落点，无未决缺口；一处有意整合（#13，编辑能力由维护页等价承接），新增能力 4 项，其余全量保留。
