# Tasks

## 1. 聚类（前端）

- [x] 1.1 `medicalReport.ts`：新增 `clusterUnnamedIndicators`（归一化精确 + 相似度 ≥0.85 分簇）与导出类型 `UnnamedCluster`
- [x] 1.2 `medicalReport.test.ts`：聚类单测（精确同簇、相似同簇、不同指标不误并、空/单条边界）
- [x] 1.3 `MedicalReportImportDialog.tsx`：未命名区按簇渲染（一个命名框 + 条数徽标），命名应用至整簇

## 2. 二次匹配（后端）

- [x] 2.1 `parser/label_matcher.py`：prompt + 请求/响应构造 + 归一化 + USE_MOCK 分支
- [x] 2.2 `main.py`：注册 `POST /api/match-labels`（校验入参、错误映射 502、健康检查不动）
- [x] 2.3 `tests/test_label_matcher.py`：mock httpx 单测（成功/部分失败/mock 模式/超时）

## 3. 二次匹配（前端接线）

- [x] 3.1 `medicalReport.ts`：`matchUnnamedLabels` 客户端（复用多端点兜底，失败返回 null 静默降级）
- [x] 3.2 `MedicalReportImportDialog.tsx`：聚类后自动请求 AI 建议，「AI 建议：xxx」一键采用，不自动导入

## 4. Vercel 迁移

- [x] 4.1 新增 `api/report-parser.py` 函数入口（复用 report-parser 的 app）+ `requirements-vercel.txt`
- [x] 4.2 `vercel.json`：rewrites + maxDuration 60
- [x] 4.3 新增 `src/app/services/imageCompress.ts`（长边 2000 / JPEG 0.85）+ 单测；`MedicalReportImportDialog` 接入
- [x] 4.4 删除 `render.yaml`、`report-parser/Dockerfile`；更新 README/.env.example
- [ ] 4.5 部署后 smoke：/api/healthz、/api/parse（小图）、/api/match-labels 各一次（用户配合验证）

## 5. 验证

- [x] 5.1 全量测试：`/tmp/rp-venv/bin/python -m pytest report-parser/tests/ -q` 全过；`npx vitest run src/app/services/` 相关用例通过（环境允许时）
- [x] 5.2 手动走查：/api/match-labels 真实 GLM 调用通过（血清甘油三酯→甘油三酯、超敏C反应蛋白→C反应蛋白）；前端聚类/AI 建议以真实报告照片走查留待用户下次导入确认
- [x] 5.3 `npx tsc --noEmit` 与基线对比无新增错误
