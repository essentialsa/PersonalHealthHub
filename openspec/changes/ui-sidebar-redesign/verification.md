# 验收记录 — ui-sidebar-redesign

日期：2026-08-30　分支：`feature/ui-sidebar-redesign`

## 自动化

| 检查 | 结果 |
|---|---|
| `npx vitest run` | ✅ 81/81（修复了 main 上已存在的 11 个失败：2 个 supabase mock 缺 onAuthStateChange 返回值、9 个 medicalReport mock 缺 clusterUnnamedIndicators 导出 + 1 个异步时序） |
| `node check-tsc-baseline.mjs` | ✅ 36 errors 全部在基线内（无新增） |
| `vite build` | ✅ 通过（chunk 体积警告为基线现状） |

## 运行时冒烟（ui_redesign_smoke.cjs，preview 构建 + 52 条注入数据）

**39/39 通过**，截图存于 `screenshots/ui-redesign/`（16 张，桌面 1440×900 + 移动 375×812）。

桌面：侧栏 9 入口全开核对（添加记录/指标维护/报告导入/问诊简报/Excel导入/导出Excel/云同步/立即同步/删除全部确认弹窗）、顶栏搜索过滤（列表按日期共 2 条、图表 5→0、维护页行过滤）、分页（血压 13 条 → 第 11-13 条翻页）、通知面板打开 + 查看全部变更跳转维护页、图表页时间范围（90天空态正确）+ 血脂 4 指标卡 + 雷达卡、维护页 6 个启动按钮 + 危险区 + 记录表格/变更记录保留。

移动端：侧栏隐藏、汉堡抽屉打开、抽屉内触发添加记录弹窗。

## 冒烟中发现并修复的问题

1. 侧边栏 outline 类弹窗按钮因基类 `backdrop-blur-sm` 在透明背景上产生白色圆角模糊块 → 侧栏按钮类追加 `backdrop-blur-none`。
2. 危险区按钮文案按设计稿调整为「删除全部数据」（ClearAllDataDialog 增加 triggerLabel 属性）。

## 增量：图表分析双视图模式（2026-08-30 追加）

grill-me 梳理后追加：图表分析页支持「分指标卡片 ⇄ 多指标对比」视图切换。

- 切换控件位于卡头部时间范围旁，同款胶囊分段样式；默认卡片模式；`viewMode` 持久化进 `health_chart_view`，刷新恢复
- 叠加模式：单张 320px 多线图；多指标时按指标各自 min-max 归一化 0-100（tooltip 显示原始值+单位，图上注明），单指标退化原始值；图例 chip 点击显隐；分类/时间/搜索筛选与卡片模式完全共享；雷达卡仅卡片模式
- 实现在 ChartAnalysisPage 内部，未复活 RecordChart 挂载

验证：vitest 81/81、tsc 基线无新增、冒烟新增 7 项（叠加单图/归一化提示/4线渲染/图例显隐 4→3/刷新持久化/分类持久化/切回卡片）共 **46/46 通过**，截图 `19-chart-overlay.png`、`19b-chart-overlay-settled.png`。

补充（同日）：图例隐藏到仅剩 1 条可见线时，坐标轴退回原始值范围（Y 轴自适应数据、说明文字切「纵轴为原始值」）；恢复多线后回到归一化。冒烟扩至 **48/48 通过**，截图 `19-chart-overlay-single.png`。

## 已知残留（不阻塞）

- 登录态 UI（顶栏头像/侧栏底部用户菜单）代码实现并编译通过，但冒烟环境无真实 Supabase 后端，登录后路径未做浏览器级验证。
- 云同步真实上传、报告 OCR 解析依赖外部服务（Drive 授权 / parser 后端），冒烟仅验证入口与状态徽章，与重构前一致。
- RecordChart.tsx 文件保留未删（图表页已由 ChartAnalysisPage 替代），供回退参考，可在后续 change 清理。
