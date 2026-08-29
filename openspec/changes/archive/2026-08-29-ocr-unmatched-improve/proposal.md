# OCR 未匹配指标优化 + OCR 后端迁入 Vercel

## Why

体检报告 OCR 导入流程中，模型识别出的指标若既未命中用户指标库、也未命中标准词典，会归入「未命名」区由用户逐条手动命名（`medicalReport.ts` `resolveIndicators` 第三步，action=`unnamed`）。真实使用中有两个痛点：

1. **重复命名**：同一指标在报告里出现多次（或跨次导入），由于写法差异（全半角、括号、简称），每次都要重新命名一遍
2. **编辑距离匹配的盲区**：中文指标的写法变体（"血清甘油三酯"vs"甘油三酯"、"载脂蛋白A1"vs"载脂蛋白A-I"）编辑距离打分经常失手，明明用户的指标库里有对应项却被判为未匹配

同时，既然 OCR 已改为"多模态模型 API 直读"的薄代理，**独立付费维护 Render 后端不再必要**——薄代理可以搬进 Vercel Serverless 与前端同域部署，下线 Render，运维面收敛为一处。

## What Changes

1. **未匹配项自动聚类**（纯前端）：新增聚类函数，把 `unnamed` 指标按"归一化名称精确相等 或 规范化相似度 ≥ 0.85"分簇；确认页每簇只展示一个命名输入框，命名后应用到整簇（每条保留各自的数值/日期）
2. **免费模型二次匹配**（前端 + 薄后端）：report-parser 新增 `POST /api/match-labels`——输入未匹配指标名列表 + 用户指标库清单，调 GLM-4V-Flash（免费，文本模式）返回语义匹配建议；前端对聚类后的簇自动调用，建议以「AI 建议」标记预填，**用户确认后才应用**，失败静默降级为纯手动
3. **OCR 后端迁入 Vercel Serverless、下线 Render**：
   - 新增 `api/` 目录承载 Vercel Python 函数，复用 `report-parser/` 的解析模块（本地开发仍用 uvicorn 跑 report-parser）
   - `vercel.json` 增加路由：`/api/parse`、`/api/match-labels` 转发到函数；函数 `maxDuration` 设 60s（模型调用耗时）
   - 前端上传前图片压缩：canvas 等比缩放到长边 ≤2000px、JPEG 质量 0.85，控制在 Vercel 4.5MB 请求体上限内（对模型识别也更友好）
   - 删除 `render.yaml` 与 `report-parser/Dockerfile`；`.env.example`/文档更新
   - **用户侧动作**（合并部署后）：在 Vercel 项目环境变量设置 `VISION_LLM_API_KEY`，在 Render 控制台删除旧服务

## Impact

- **specs**: 无既有 main spec（openspec/specs 为空），本 change 不产生 delta spec，行为以 proposal/tasks 表达
- **code**: `src/app/services/medicalReport.ts`、`src/app/components/MedicalReportImportDialog.tsx`（聚类+AI 建议）、新增 `api/` 函数、`vercel.json`、`report-parser/parser/label_matcher.py`（新）、`report-parser/main.py`、删除 `render.yaml`/`report-parser/Dockerfile`、相关测试文件；图片压缩放 `src/app/services/imageCompress.ts`（新）
- **非目标**: 不改变已匹配指标（import/create_item/create_category）的任何行为；不做自动导入；本地 uvicorn 开发路径保留
