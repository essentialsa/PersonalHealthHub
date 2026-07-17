# CLAUDE.md

## Project Rules

### Git Workflow
- Always commit changes after implementation
- Always create PR using `gh pr create` when pushing code
- Never ask user to manually create PR
- Do not commit non-project files: `.agents/`, `.mimocode/`, `.comet/`, `.codegraph/`, `skills-lock.json`

## Project Context

PersonalHealthHub — a personal health data management SPA with Chinese UI. Manages health records (blood pressure, blood sugar, cholesterol, liver/renal function, weight, BMI, heart rate), supports indicator category customization, chart visualization, Excel import/export, medical report OCR+LLM import, consultation brief generation, and cloud sync via Supabase + Google Drive.

## Tech Stack

- Frontend: React 18 + TypeScript + Vite 6 + Tailwind CSS 4 + shadcn/ui + recharts + xlsx
- Backend: Supabase (auth + DB), Google Drive OAuth (PKCE flow)
- Storage: Browser localStorage (versioned keys with XOR encryption)
