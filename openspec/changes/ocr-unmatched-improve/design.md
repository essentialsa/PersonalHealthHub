# 设计说明

## 1. 未匹配项自动聚类（前端）

新增纯函数 `clusterUnnamedIndicators(unnamed: ResolvedIndicator[]): UnnamedCluster[]`

```ts
interface UnnamedCluster {
  key: string;            // 归一化后的规范名（取簇内首条）
  canonicalLabel: string; // 展示用的原始写法（首条）
  items: ResolvedIndicator[];
}
```

- 归一化：复用 `normalizeIndicatorText`（去空格/标点/全半角统一）后精确相等的直接同簇
- 相似归簇：归一化后不同名但编辑距离相似度 ≥ 0.85 的并入同簇（复用现有 `similarityScore`/编辑距离实现）；保守阈值，避免把"白细胞"和"白细胞酯酶"这类真不同指标并掉
- 合并顺序：按出现顺序线性扫描并入已有簇，确定性输出
- UI（`MedicalReportImportDialog.tsx` 未命名区）：每簇渲染一条「名称（n 条记录）」+ 一个命名输入；确认时对簇内每条记录应用同一命名（各自保留数值/日期）
- 命名应用后：走现有"创建新指标项"路径，行为不变

## 2. 免费模型二次匹配（后端薄接口 + 前端调用）

### 后端：`POST /api/match-labels`

- 新模块 `report-parser/parser/label_matcher.py`，与 `vision_engine` 复用同一套环境变量（`VISION_LLM_*`，默认 glm-4v-flash，免费）
- 请求：`{ "labels": ["血清甘油三酯", ...], "catalog": [{ "id": "...", "label": "甘油三酯" }, ...] }`
- Prompt：让模型对每个 label 从 catalog 中选出语义相同的项或返回 null；`response_format: json_object`；temperature 0
- 输出：`{ "matches": [{ "label": "...", "catalogId": "...|null", "catalogLabel": "...|null" }] }`
- 归一化输出 label 与请求对齐；单条解析失败不影响整体；模型不可用/超时返回 502 + 中文错误（与 /api/parse 错误风格一致）
- USE_MOCK=true 时返回固定映射（测试用）
- 前端无 API key，必须经后端转发——与 /api/parse 相同的安全边界

### 前端

- `medicalReport.ts` 新增 `matchUnnamedLabels(labels, catalog)`：走现有 `VITE_REPORT_PARSER_URLS` 多端点兜底逻辑（提取公共的"按序尝试端点"辅助函数），失败返回 null（调用方静默降级）
- `MedicalReportImportDialog.tsx`：聚类完成后对未命名的簇批量调用一次（一次请求带全部簇名），返回的建议在簇的命名输入旁显示「AI 建议：xxx」+ 一键采用按钮；用户不点就用原名手动输入，**绝不自动导入**
- 免费保证：GLM-4V-Flash 文本调用与图片调用同价（免费），每次导入最多多一次请求

## 3. 测试

- `medicalReport.test.ts`：聚类（精确同簇/相似同簇/不误并不同指标/空数组）
- `report-parser/tests/test_label_matcher.py`：请求构造、响应归一化、单条失败容错、mock 模式、模型不可用错误映射
- 手动验证：上传含写法变体的报告照片，确认聚类合并与 AI 建议出现

## 4. 风险

- LLM 语义匹配可能给出错误建议 → 以"建议+人工确认"形态呈现，不自动导入，风险可控
- 用户指标库很大时 prompt 变长 → catalog 只传 id+label，一般个人库 <100 项，无压力
- 后端不可用时二次匹配静默降级为纯手动，不影响主流程


## 5. OCR 后端迁入 Vercel Serverless

### 结构

- 新增 `api/report-parser.py`：Vercel Python 函数入口，`sys.path` 加入仓库根后复用 `report-parser.main` 的 FastAPI `app`（Vercel Python runtime 会自动发现 ASGI app）
- 依赖：仓库根新增 `requirements-vercel.txt`（fastapi/uvicorn/httpx/pymupdf/pydantic；不含 pytest/uvicorn dev 项）；若 runtime 不识别根级文件，则在 `api/requirements.txt` 再放一份（部署后以实际运行为准，任务里含验证步骤）
- `vercel.json`：
  - rewrites：`/api/parse`、`/api/match-labels`、`/api/healthz`、`/api/ocr-readyz` → 函数
  - 函数配置 `maxDuration: 60`（模型调用耗时，Hobby 上限内）
- 本地开发路径不变（uvicorn 跑 report-parser），函数仅在线上生效

### 4.5MB 请求体约束 → 前端图片压缩

- 新增 `src/app/services/imageCompress.ts`：`compressImageFile(file, maxEdge=2000, quality=0.85)`——createImageBitmap + canvas 等比缩放输出 JPEG blob；非图片（PDF）不压缩（PDF 页面在后端渲染，多数报告 PDF < 4.5MB，超限时明确报错提示拆分/拍照）
- `MedicalReportImportDialog` 上传时对图片类文件先压缩再上传
- 好处：请求体可控、模型输入分辨率更稳定

### Render 下线

- 删除 `render.yaml`、`report-parser/Dockerfile`
- README/.env.example 移除 Render 部署说明，改为 Vercel 说明
- 用户侧动作（部署后）：Vercel 设置 `VISION_LLM_API_KEY`；Render 控制台手动删除旧服务（代码删除不代表平台资源删除）

### 风险

- Vercel Python runtime 的依赖文件位置存在版本差异（根级 vs api/ 目录）→ 任务含部署后 smoke 验证，必要时双份
- Hobby 计划函数时长上限 60s，密集多页报告接近上限 → 与本地行为一致的分批策略已把单次请求拆小
- 同域部署后 CORS 不再需要（相对路径请求），前端 URL 解析需接受相对路径（实现时核对 normalizeParserEndpoint）
