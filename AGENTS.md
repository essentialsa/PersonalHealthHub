# AGENTS.md

Instructions for AI coding agents working in this repo (in the spirit of Karpathy's AGENTS.md recommendation: short, factual, an onboarding doc — not a novel).

## What this project is

PersonalHealthHub — a personal health data management SPA with a Chinese-language UI. Manages health records (blood pressure, blood sugar, cholesterol, liver/renal function, weight, BMI, heart rate), supports custom indicator categories, chart visualization, Excel import/export, medical report OCR+LLM import, consultation brief generation, and cloud sync (Supabase auth + Google Drive OAuth PKCE). Local data lives in browser localStorage with versioned keys and XOR encryption.

## Layout

- `src/app/App.tsx` — main application shell; most feature components live in `src/app/components/`
- `src/app/components/ui/` — shadcn/ui-style primitives; `components/figma/` — original Figma-generated components (treat as legacy)
- `src/app/services/` — business logic (`medicalReport.ts` OCR import flow, `attachment.ts` attachment handling); co-located `*.test.ts(x)` files
- `report-parser/` — separate Python FastAPI backend (PaddleOCR + LLM structuring); `requirements.txt`, own `tests/`, Dockerfile; deployed to Render
- `e2e/` — Playwright; `openspec/` — spec-driven change management; `guidelines/Guidelines.md` — read before UI work
- `DEV_PLAN_MEDICAL_REPORT_IMPORT.md` — design doc for the medical report import feature

## Commands

- Dev server: `pnpm dev` (Vite, port 5173, strictPort) — `start_dev.sh` wraps dev + report-parser
- Build: `pnpm build`
- Tests: no script defined — run `npx vitest run` (jsdom, setup file `src/setupTests.ts`); single file: `npx vitest run src/app/services/attachment.test.ts`
- No lint or typecheck script exists; use `npx tsc --noEmit` manually before finishing TypeScript changes
- Python backend (optional): `cd report-parser && uvicorn main:app` (Python 3.11+)

## Conventions & gotchas

- Path alias `@/` → `src/`
- All user-facing strings are Chinese; keep new UI text in Chinese
- Stack: React 18 + TypeScript + Vite 6 + Tailwind CSS 4 + shadcn/ui + Recharts + xlsx. Tailwind 4 is configured via `@tailwindcss/vite` plugin and `src/styles/`, not a `tailwind.config` file
- Env vars are `VITE_*` build-time (Supabase, Google Drive OAuth, `VITE_REPORT_PARSER_URLS` — OCR endpoints tried in order, cloud first, local fallback); copy `.env.example` to `.env`
- Never commit secrets, `.env`, or user health data files (e.g. `体检数据_*.xlsx` sample workbooks are local fixtures — check before adding to git)
- `web/` is an empty placeholder; `dist/` is build output — don't edit either
- This is a personal-data app: don't send record contents to external services beyond the existing OCR/LLM pipeline flow

## Git workflow (from CLAUDE.md, still applies)

- Commit after implementation; create PRs with `gh pr create`, never ask the user to
- Do not commit non-project files: `.agents/`, `.mimocode/`, `.comet/`, `.codegraph/`, `skills-lock.json`

<comet-ambient-resume>
<!-- Managed by Comet. Edits inside this block may be replaced by comet init/update. -->
<!-- Contract: comet.resume_probe.v2 -->

## Comet Ambient Resume

在这个仓库中，开始处理需要改动或调查的任务前，如果可能存在活跃 Comet workflow，把当前用户请求传入只读探针：`comet resume-probe . --stdin --json`。

- 如果用户通过宿主明确调用任意 Comet Skill（例如 `@comet`、`/comet`、`@comet-native` 或 `/comet-hotfix`），显式调用优先于本恢复协议；不要运行 resume probe，直接进入被调用的 Skill。
- 如果用户通过宿主明确调用的是非 Comet 的 Skill 或斜杠命令，任务意图已由该调用明确：不要运行 resume probe，直接执行该 Skill。
- 如果你正在 Comet 流程内（包括正在等待用户回复你在流程中提出的问题），不要运行 resume probe；把这类回复（例如方案/选项选择）当作当前 change 的继续，直接按用户的选择推进。
- 只信任返回的 `workflow`、`skill` 和 `entrySource`；它们只由项目配置或无配置兼容回退决定。不得扫描或切换另一套 workflow。
- 如果 probe 返回 `auto_resume`，简短说明选中的 active change，并进入 `nextCommand` 指向的永久入口。不要把状态命令当作恢复入口直接推进。
- 如果 probe 返回 `ask_user`，只问一个简短问题并等待用户回复。
- 如果当前请求未明确调用 Comet Skill，且 probe 返回 `out_of_scope` 或 `none`，不要进入 Comet workflow。
- `out_of_scope` 或 `none` 只表示不要因为这个新请求进入 Comet workflow；它绝不表示要暂停或退出一个已在进行的 Comet 流程。
- 如果配置或状态无效且没有 `nextCommand`，停止并报告原因；不要猜测另一个 workflow。
- 不能只因为存在 active change 就把无关任务挂到该 change。Native 的未提交改动由 Native 入口检查，不由探针自动归因。
</comet-ambient-resume>
