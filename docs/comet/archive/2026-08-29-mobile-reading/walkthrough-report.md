# 移动端（375px）走查与验证记录

日期：2026-08-29　·　视口：375×812（deviceScaleFactor 2，Chromium headless）　·　构建：`vite build` + `vite preview :4173`　·　脚本：`mobile_walkthrough.cjs`（仓库根目录）

## 结论

**四项走查全部通过，未发现需要代码修复的缺陷；本次零代码改动。**

## 走查项与证据

| 验收项 | 结果 | 证据 |
|---|---|---|
| A2 RecordTable（数据维护 tab） | ✅ 通过 | `verification-shots/m4-maintenance-full.png`：日期/指标/数值徽章渲染整齐，无重叠；参考范围/操作列在横向滚动容器内可达（容器 scrollWidth 615 > 可视 293，可滑动） |
| A3 RecordChart（图表分析 tab） | ✅ 通过 | `verification-shots/m2-chart.png`、`m2-chart-full.png`：图例 chips 自动换行、三条曲线完整渲染、时间轴斜排标签完整；详情表在滚动容器内可滑（501 > 293） |
| A4 问诊简报 | ✅ 通过 | `verification-shots/m3-brief.png`：弹窗完整展示（模式/分类/时间范围/生成报告），「复制摘要」按钮存在（计数=1），复制走 navigator.clipboard 与桌面一致 |
| A5 附件预览（图片） | ✅ 通过 | `verification-shots/m5-attachment.png`：点击记录行回形针打开预览弹窗，图片渲染区与下载按钮完整可用 |
| A5 附件预览（PDF） | ✅ 通过 | `verification-shots/m6-pdf-attachment.png`：PDF 附件（fixture 852B）预览弹窗完整、iframe 渲染确认（locator 计数 >0）、下载按钮可用 |
| A7 桌面回归（1440px） | ✅ 通过 | `verification-shots/d1-table.png`、`d2-chart.png`：与既有桌面布局一致 |

补充走查（2026-08-29 第二轮）：Verifier 指出 PDF 附件预览未覆盖，已补充 PDF fixture（att_002 报告.pdf）与 m6 走查，图片/PDF 双路径证据齐全。
| 横向溢出 | ✅ 通过 | 三个 tab 的 `document.scrollWidth - clientWidth` 均为 0（页面无整体溢出）；表格为容器内滚动 |

## 量化数据（375px）

- 数据列表 pivot 表容器：scrollWidth 429 / clientWidth 293（可滚动）
- 图表详情表容器：scrollWidth 501 / clientWidth 293（可滚动）
- 数据维护 RecordTable 容器：scrollWidth 615 / clientWidth 293（可滚动）
- 文档级横向溢出：三个 tab 均为 0px

## 已知限制（不构成缺陷，记录备查）

1. 宽表在 375px 下默认显示前几列，其余列靠横向滑动查看——shadcn Table 容器自带 `overflow-x-auto`，为标准移动表格形态；无滚动条视觉提示，靠原生滚动行为。
2. 问诊简报日期输入框显示浏览器默认 `mm/dd/yyyy` 占位（浏览器 locale 控制，非应用代码）。
3. 微信内置浏览器与真机验证留待部署后进行（本次以同一内核的 Chromium 近似覆盖）。

## 修复项

无（零代码改动——走查未发现可读性/可用性缺陷）。
