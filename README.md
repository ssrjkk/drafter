<div align="center">

# Drafter

### AI-Powered QA Assistant

**Generate test plans, analyze code, write bug reports — powered by 9 AI providers.**

[![CI](https://github.com/ssrjkk/drafter/actions/workflows/ci.yml/badge.svg)](https://github.com/ssrjkk/drafter/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-600%20passed-22c55e)](#testing)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](#tech-stack)

[Quick Start](#quick-start) | [Features](#features) | [Providers](#ai-providers) | [Deploy](#deploy) | [Contributing](#contributing)

**[Russian / Русский](README.ru.md)**

</div>

---

## What is Drafter?

A browser-based QA assistant that turns your task descriptions into structured outputs — test plans, test cases, automation code, bug reports, security checks, and more. No server required. Runs entirely in your browser with SQLite (WebAssembly).

**Core idea:** Describe what you need, pick a task type, get a professional QA artifact.

<div align="center">

```
+----------------------------------------------------+
|                                                    |
|   "Login page has form validation for email        |
|    and password fields, supports OAuth via         |
|    Google. Write test cases."                      |
|                                                    |
|   Task: Test Cases                                 |
|                                                    |
|   -> Execute                                       |
|                                                    |
|   +------------------------------------------+     |
|   | Test Case: TC-LOGIN-001                  |     |
|   | Title: Valid email + password login      |     |
|   | Steps: 1. Navigate to /login             |     |
|   |   2. Enter valid email                   |     |
|   |   3. Enter valid password                |     |
|   |   4. Click "Sign In"                     |     |
|   | Expected: Redirect to dashboard          |     |
|   | Priority: P0  |  Type: Functional        |     |
|   +------------------------------------------+     |
|                                                    |
+----------------------------------------------------+
```

</div>

---

## About

Drafter is a browser-based, zero-server QA assistant that generates professional QA artifacts from task descriptions. It connects to 9 AI providers (7 free), runs a tool-use agentic loop with codebase analysis, and stores everything locally via SQLite WASM. Built for QA engineers who need fast, structured outputs without leaving the browser.

- **Website:** https://drafter.ssrjkk.dev
- **Repository:** https://github.com/ssrjkk/drafter

### Renamed from QA Copilot

Drafter was previously published as **QA Copilot** (repository `ssrjkk/qa-helper`). The rename changed every storage identifier, so on first start after upgrading `src/lib/legacyMigration.ts` copies the old localStorage keys (`qa-copilot-*`, `qa-helper-*`) and the old IndexedDB databases (`qa-helper-db`, `qa-copilot-keys`) to their new `drafter-*` names, and `src/lib/keyManagement.ts` upgrades the old master-password verify token. Existing installs keep their data, API key and master password.

---

## Quick Start

**3 steps to your first QA output:**

```bash
git clone https://github.com/ssrjkk/drafter.git
cd drafter
npm install && npm run dev
```

Open `http://localhost:5173`, enter your API key, pick a task type, describe your context, and hit Execute.

> **No API key?** Use Groq or DeepSeek — both are free and don't require a credit card.

<details>
<summary><b>Docker</b></summary>

```bash
docker compose up -d
# Open http://localhost:3000
```

The image is a multi-stage build (Node build stage -> Caddy runtime). Caddy is rebuilt with the `github.com/mholt/caddy-ratelimit` module because the Caddyfile uses the `rate_limit` directive, and the image ships a `HEALTHCHECK`.
</details>

<details>
<summary><b>Production build</b></summary>

```bash
npm run build     # dist/ folder
npm run preview   # preview locally
```

`npm run build` prints the bundle and CSS sizes; `npm run analyze` writes a bundle visualization.
</details>

---

## Features

<table>
<tr>
<td width="50%">

### 17 Task Types

**Generate** — Test Plans, Test Cases, Automation Code, API Tests, Load Tests, Mobile Tests, AI Model Tests

**Analyze** — Requirements Analysis, Observability, Quality Metrics

**Review** — Bug Reports, Code Review, Screenshot Analysis

**Setup** — Security Checks, CI/CD Pipelines, Checklists, Contract Tests

</td>
<td width="50%">

### Smart Features

- **Streaming responses** — output appears in real-time
- **Structured Memory** — AI extracts tech stack, bug patterns, conventions, and reuses them across tasks
- **Context Presets** — pre-built templates for E2E, Unit, API, Mobile testing
- **Agent Mode** — multi-step reasoning for complex QA tasks
- **Export** — Markdown, PDF, JSON, CSV, TXT
- **Session History** — virtualized list, search, load previous sessions

</td>
</tr>
<tr>
<td>

### Security

- AES-256-GCM encryption for API keys (PBKDF2, 100k iterations)
- XSS sanitization on all inputs
- Parameterized SQL queries
- Rate limiting (10 req/min)
- Content Security Policy headers
- Master password protection

</td>
<td>

### Developer Experience

- **600 tests** in 47 files (unit, integration, property-based)
- **49 E2E tests** in 12 spec files (Playwright)
- **Lighthouse CI** in GitHub Actions
- Pre-commit hooks (eslint, lint-staged)
- Commitlint with conventional commits
- Strict TypeScript + ESLint zero warnings

</td>
</tr>
</table>

---

## AI Providers

Drafter supports **9 providers** with a unified interface. Pick any — the experience is identical.

| Provider | Free? | Default Model | Get Key |
|----------|-------|---------------|---------|
| **Groq** | Yes | `llama-3.3-70b-versatile` | [console.groq.com](https://console.groq.com) |
| **DeepSeek** | Yes | `deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com) |
| **Gemini** | Yes | `gemini-1.5-flash` | [ai.google.dev](https://ai.google.dev) |
| **OpenRouter** | Yes | `deepseek/deepseek-chat` | [openrouter.ai](https://openrouter.ai/keys) |
| **Together AI** | Yes | `meta-llama/Llama-3.3-70B-Instruct` | [api.together.ai](https://api.together.ai) |
| **Novita AI** | Yes | `deepseek/deepseek-chat` | [novita.ai](https://novita.ai) |
| **Lepton AI** | Yes | `llama-3.3-70b-instruct` | [lepton.ai](https://www.lepton.ai) |
| **Claude** | Paid | `claude-sonnet-4-20250514` | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | Paid | `gpt-4o-mini` | [platform.openai.com](https://platform.openai.com) |

---

## Architecture

```
src/
  components/
    chat/              # Chat message rendering
    features/          # App panels: ChatArea, Sidebar, TaskSelector, etc.
    layout/            # MainLayout
    modals/            # Settings, shortcuts and other modals
    panels/            # Side panels (history, memory, etc.)
    selectors/         # Provider / model / task selectors
    ui/                # GlassCard, RippleButton, Modal, Toast, etc.
  config/              # Task types, prompts, presets, security config
  data/
    agent/             # Agentic loop and tool definitions
    api/               # 9 AI provider services + UnifiedAiService
    codebase/          # GitHub & Local codebase connectors
    repositories/      # SQLite repositories (Project, Task, Memory)
  domain/
    entities/          # TypeScript models (Project, Task, Memory, Session)
    usecases/          # Business logic (ProjectUseCases, TaskUseCases, etc.)
  hooks/               # Custom hooks (useDatabase, useExecution, useTheme, etc.)
  lib/                 # Core services (database, encryption, export, storage, legacyMigration)
  presentation/        # Context providers (UseCasesContext)
  store/               # Zustand state management
  types/               # Shared TypeScript types
  workers/             # Web workers (SQLite, parsing)
  __tests__/           # Unit, integration, property-based tests
```

**Data flow:** UI -> Zustand Store -> UseCases -> Repositories -> sql.js (WASM SQLite) -> IndexedDB persistence

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Open command palette |
| `Ctrl/Cmd + Enter` | Execute task |
| `Ctrl + E` | Execute task |
| `Ctrl + Shift + R` | Reset task |
| `Ctrl + Shift + C` | Copy output |
| `Ctrl/Cmd + T` | Toggle theme |
| `Ctrl + /` | Show shortcuts |
| `Escape` | Close modals |

The copy shortcut is deliberately `Ctrl + Shift + C` rather than plain `Ctrl + C`, so native copy is never hijacked.

---

## Testing

```bash
npm run test          # 600 unit/integration tests in 47 files
npm run test:watch    # Watch mode
npm run test:e2e      # 49 Playwright E2E tests in 12 spec files
```

**Test coverage:** utils, database, security, components, tasks, QaAgent, circuit breaker, zip parser, property-based (10k iterations).

---

## Deploy

### GitHub Pages
Pushing to `master` triggers `.github/workflows/deploy.yml`, which builds with `VITE_BASE=/drafter/` and publishes to https://ssrjkk.github.io/drafter/.

### Vercel / Netlify
Push to GitHub, connect repo, auto-deploy. Build command: `npm run build`, output: `dist/`.

### Docker
```yaml
services:
  drafter:
    build: .
    ports:
      - "3000:80"
    restart: unless-stopped
```

### Self-hosted
```bash
npm run build
# Serve dist/ with any static file server (nginx, Apache, Caddy)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18.3, TypeScript 5.7, TailwindCSS 3.4 |
| State | Zustand 5 + immer |
| Database | sql.js 1.10 (SQLite WASM) + IndexedDB |
| PDF | jsPDF 4 |
| Archive | JSZip |
| Virtualization | @tanstack/react-virtual |
| Testing | Vitest, Playwright, @testing-library |
| Build | Vite 5, esbuild |
| CI | GitHub Actions (typecheck, lint, test, build, E2E, Lighthouse, Docker) |
| Quality | ESLint 9, Commitlint, Husky, lint-staged |

Bundle and CSS sizes are printed by `npm run build`; `npm run analyze` writes a bundle visualization.

---

## Limits

| Resource | Limit |
|----------|-------|
| Context length | 10,000 characters |
| Rate limit | 10 requests/minute |
| Screenshot upload | 5MB max |
| Session history | 50 entries |

---

## Environment Variables

All optional — can be configured in-app via the settings modal.

```env
# .env (optional)
VITE_API_URL=https://api.anthropic.com/v1/messages
VITE_MODEL=claude-sonnet-4-20250514
VITE_MAX_TOKENS=8192
VITE_BASE=/drafter/          # base path for the built app
TEST_MASTER_PASSWORD=secret  # E2E tests only
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make changes (ensure `npm run lint` and `npm run test` pass)
4. Commit with conventional format: `git commit -m 'feat: add amazing feature'`
5. Push and create a Pull Request

### Development

```bash
npm install
npm run dev          # Start dev server
npm run lint         # Check linting
npm run typecheck    # Check types
npm run test         # Run tests
npm run test:e2e     # Run E2E tests
```

---

## License

MIT License. Copyright (c) 2026 ssrjkk. See [LICENSE](LICENSE) for details.

---

## Author

**ssrjkk** — QA Engineer & Software Developer

- Telegram: [@ssrjkk](https://t.me/ssrjkk)
- GitHub: [ssrjkk](https://github.com/ssrjkk)
- Email: ray013lefe@gmail.com

---

<div align="center">

**Built with care for the QA community.**

</div>
