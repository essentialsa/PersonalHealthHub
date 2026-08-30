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

## 已知残留（不阻塞）

- 登录态 UI（顶栏头像/侧栏底部用户菜单）代码实现并编译通过，但冒烟环境无真实 Supabase 后端，登录后路径未做浏览器级验证。
- 云同步真实上传、报告 OCR 解析依赖外部服务（Drive 授权 / parser 后端），冒烟仅验证入口与状态徽章，与重构前一致。
- RecordChart.tsx 文件保留未删（图表页已由 ChartAnalysisPage 替代），供回退参考，可在后续 change 清理。
