# Outcome

手机浏览器（含微信内置浏览器）上能顺畅查看健康数据：375px 宽度下表格/图表/就诊摘要/附件预览可读可用，发现的问题针对性修复。范围严格继承父级 Supervisor Change（healthhub-product-upgrade）已确认的 mobile-reading 能力规格。

# Scope

- 以 375px 视口为基准走查 RecordTable、RecordChart、ConsultationBriefDialog、AttachmentPreviewDialog
- 记录走查中发现的可读性问题并修复（限定四个组件及必要样式文件）
- 桌面端回归验证

## Source coverage

需求来源为父级 Supervisor Change 已确认的 specs/mobile-reading/spec.md 与 brief 决策 D8，已完整映射至本 change 的 spec 与验收 A1-A8（对应父级 A7），覆盖状态 complete。

# Non-goals

- 不做原生 App、不做全站响应式改造
- 不引入新的移动端专属功能
- 不改动业务逻辑与数据流（纯呈现层修复）

# Acceptance examples

- A1（父 A7 总）375px 宽度下 RecordTable/RecordChart 数据可读、就诊摘要可展示复制；发现的问题修复并留有验证记录
- A2 RecordTable：数值列、参考范围箭头、高低颜色标识完整可读，无重叠、无横向溢出截断，窄屏保持对齐
- A3 RecordChart：趋势图完整显示时间轴与指标图例；多指标场景不挤压变形；详情表窄屏可用
- A4 ConsultationBriefDialog：摘要文本完整展示、可一键复制，复制结果与桌面端一致
- A5 附件预览：图片/PDF 在窄屏正常预览
- A6 走查发现的问题按"针对性修复"原则处理，不引入全站响应式改造
- A7 桌面端现有布局与交互不受影响（回归验证）
- A8 用户可见文案全部中文

# Constraints and invariants

- 修复限定在 RecordChart.tsx、RecordTable.tsx、ConsultationBriefDialog.tsx、AttachmentPreviewDialog.tsx 及必要样式文件
- 用户可见文案全部中文

# Decisions

- 继承父级 D8：只做窄屏验证 + 针对性修复
- 验证方式：Playwright 以 375px 视口截图走查（e2e/ 已有 Playwright 基础设施）+ 代码审查；微信内置浏览器以同一 WebKit/Chromium 内核近似覆盖，真机微信验证留待部署后

# Open questions

（无——范围严格继承父级已确认 Shape。）

# Verification expectations

- 375px 视口 Playwright 截图走查记录（修复前后对照）
- npx tsc --noEmit 与基线对比
- vitest 既有用例通过（若环境可用）
