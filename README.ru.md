<div align="center">

# Drafter

### AI-Powered QA Assistant

**Генерация тест-планов, анализ кода, написание баг-репортов — на базе 9 AI-провайдеров.**

[![CI](https://github.com/ssrjkk/drafter/actions/workflows/ci.yml/badge.svg)](https://github.com/ssrjkk/drafter/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-600%20passed-22c55e)](#тестирование)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](#технологический-стек)

[Быстрый старт](#быстрый-старт) | [Возможности](#возможности) | [Провайдеры](#ai-провайдеры) | [Деплой](#деплой) | [Контрибьюция](#контрибьюция)

**[English / Английский](README.md)**

</div>

---

## Что такое Drafter?

QA-ассистент в браузере, который превращает описания задач в структурированные артефакты: тест-планы, тест-кейсы, код автоматизации, баг-репорты, проверки безопасности и многое другое. Сервер не нужен. Работает целиком в браузере на SQLite (WebAssembly).

**Суть:** Опиши задачу, выбери тип, получи готовый QA-артефакт.

<div align="center">

```
+----------------------------------------------------------+
|                                                          |
|   "Страница логина с валидацией формы email               |
|    и пароля, поддержка OAuth через Google.                |
|    Напиши тест-кейсы."                                   |
|                                                          |
|   Задача: Test Cases                                     |
|                                                          |
|   -> Execute                                             |
|                                                          |
|   +------------------------------------------+           |
|   | Test Case: TC-LOGIN-001                  |           |
|   | Title: Валидный логин email + пароль      |           |
|   | Steps: 1. Перейти на /login              |           |
|   |   2. Ввести валидный email               |           |
|   |   3. Ввести валидный пароль              |           |
|   |   4. Нажать "Войти"                      |           |
|   | Expected: Редирект на дашборд            |           |
|   | Priority: P0  |  Type: Functional        |           |
|   +------------------------------------------+           |
|                                                          |
+----------------------------------------------------------+
```

</div>

---

## О проекте

Drafter — QA-ассистент в браузере без сервера, который генерирует профессиональные QA-артефакты из описаний задач. Подключается к 9 AI-провайдерам (7 бесплатных), выполняет агентный цикл с анализом кодовой базы и хранит всё локально через SQLite WASM. Создан для QA-инженеров, которым нужны быстрые структурированные результаты без выхода из браузера.

- **Сайт:** https://drafter.ssrjkk.dev
- **Репозиторий:** https://github.com/ssrjkk/drafter

### Переименование из QA Copilot

Ранее проект назывался **QA Copilot** (репозиторий `ssrjkk/qa-helper`). Переименование изменило все идентификаторы хранилища, поэтому при первом запуске после обновления `src/lib/legacyMigration.ts` копирует старые ключи localStorage (`qa-copilot-*`, `qa-helper-*`) и старые базы IndexedDB (`qa-helper-db`, `qa-copilot-keys`) в новые имена `drafter-*`, а `src/lib/keyManagement.ts` обновляет старый verify-токен мастер-пароля. Существующие установки сохраняют данные, API-ключ и мастер-пароль.

---

## Быстрый старт

**3 шага до первого результата:**

```bash
git clone https://github.com/ssrjkk/drafter.git
cd drafter
npm install && npm run dev
```

Открой `http://localhost:5173`, введи API-ключ, выбери тип задачи, опиши контекст и нажми Execute.

> **Нет API-ключа?** Используй Groq или DeepSeek — оба бесплатные, кредитная карта не нужна.

<details>
<summary><b>Docker</b></summary>

```bash
docker compose up -d
# Открой http://localhost:3000
```

Образ собирается в несколько этапов (стадия сборки на Node -> рантайм на Caddy). Caddy пересобирается с модулем `github.com/mholt/caddy-ratelimit`, потому что Caddyfile использует директиву `rate_limit`, а образ содержит `HEALTHCHECK`.
</details>

<details>
<summary><b>Production-сборка</b></summary>

```bash
npm run build     # папка dist/
npm run preview   # предпросмотр локально
```

`npm run build` печатает размеры бандла и CSS; `npm run analyze` создаёт визуализацию бандла.
</details>

---

## Возможности

<table>
<tr>
<td width="50%">

### 17 типов задач

**Generate** — Тест-планы, Тест-кейсы, Код автоматизации, API-тесты, Нагрузочные тесты, Мобильные тесты, AI-тесты

**Analyze** — Анализ требований, Observability, Метрики качества

**Review** — Баг-репорты, Ревью кода, Анализ скриншотов

**Setup** — Проверка безопасности, CI/CD, Чеклисты, Контрактные тесты

</td>
<td width="50%">

### Умные функции

- **Стриминг ответов** — вывод в реальном времени
- **Структурная память** — AI извлекает стек, паттерны багов, конвенции и переиспользует их
- **Пресеты контекста** — готовые шаблоны для E2E, Unit, API, Mobile тестирования
- **Режим агента** — многошаговое рассуждение для сложных задач
- **Экспорт** — Markdown, PDF, JSON, CSV, TXT
- **История сессий** — виртуализированный список, поиск, загрузка прошлых сессий

</td>
</tr>
<tr>
<td>

### Безопасность

- AES-256-GCM шифрование API-ключей (PBKDF2, 100k итераций)
- XSS-санитизация всего ввода
- Параметризованные SQL-запросы
- Rate limiting (10 запросов/мин)
- Content Security Policy заголовки
- Защита мастер-паролем

</td>
<td>

### Developer Experience

- **600 тестов** в 47 файлах (unit, integration, property-based)
- **49 E2E тестов** в 12 spec-файлах (Playwright)
- **Lighthouse CI** в GitHub Actions
- Pre-commit хуки (eslint, lint-staged)
- Commitlint с conventional commits
- Строгий TypeScript + ESLint ноль предупреждений

</td>
</tr>
</table>

---

## AI-провайдеры

Drafter поддерживает **9 провайдеров** с единым интерфейсом. Любой на выбор — опыт одинаковый.

| Провайдер | Бесплатный? | Модель по умолчанию | Получить ключ |
|-----------|-------------|---------------------|---------------|
| **Groq** | Да | `llama-3.3-70b-versatile` | [console.groq.com](https://console.groq.com) |
| **DeepSeek** | Да | `deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com) |
| **Gemini** | Да | `gemini-1.5-flash` | [ai.google.dev](https://ai.google.dev) |
| **OpenRouter** | Да | `deepseek/deepseek-chat` | [openrouter.ai](https://openrouter.ai/keys) |
| **Together AI** | Да | `meta-llama/Llama-3.3-70B-Instruct` | [api.together.ai](https://api.together.ai) |
| **Novita AI** | Да | `deepseek/deepseek-chat` | [novita.ai](https://novita.ai) |
| **Lepton AI** | Да | `llama-3.3-70b-instruct` | [lepton.ai](https://www.lepton.ai) |
| **Claude** | Платно | `claude-sonnet-4-20250514` | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | Платно | `gpt-4o-mini` | [platform.openai.com](https://platform.openai.com) |

---

## Архитектура

```
src/
  components/
    chat/              # Рендеринг сообщений чата
    features/          # Панели приложения: ChatArea, Sidebar, TaskSelector и т.д.
    layout/            # MainLayout
    modals/            # Модалки настроек, горячих клавиш и т.д.
    panels/            # Боковые панели (история, память и т.д.)
    selectors/         # Селекторы провайдера / модели / задачи
    ui/                # GlassCard, RippleButton, Modal, Toast и т.д.
  config/              # Типы задач, промпты, пресеты, конфигурация безопасности
  data/
    agent/             # Агентный цикл и определения инструментов
    api/               # 9 сервисов AI-провайдеров + UnifiedAiService
    codebase/          # Подключение GitHub и локального кода
    repositories/      # Репозитории SQLite (Project, Task, Memory)
  domain/
    entities/          # TypeScript-модели (Project, Task, Memory, Session)
    usecases/          # Бизнес-логика (ProjectUseCases, TaskUseCases и т.д.)
  hooks/               # Кастомные хуки (useDatabase, useExecution, useTheme и т.д.)
  lib/                 # Ядро (database, encryption, export, storage, legacyMigration)
  presentation/        # Контекст-провайдеры (UseCasesContext)
  store/               # Состояние (Zustand)
  types/               # Общие TypeScript-типы
  workers/             # Web workers (SQLite, парсинг)
  __tests__/           # Unit, integration, property-based тесты
```

**Поток данных:** UI -> Zustand Store -> UseCases -> Repositories -> sql.js (WASM SQLite) -> IndexedDB

---

## Горячие клавиши

| Комбинация | Действие |
|-----------|----------|
| `Ctrl/Cmd + K` | Открыть командную палитру |
| `Ctrl/Cmd + Enter` | Выполнить задачу |
| `Ctrl + E` | Выполнить задачу |
| `Ctrl + Shift + R` | Сбросить задачу |
| `Ctrl + Shift + C` | Копировать вывод |
| `Ctrl/Cmd + T` | Переключить тему |
| `Ctrl + /` | Показать горячие клавиши |
| `Escape` | Закрыть модалки |

Комбинация копирования намеренно `Ctrl + Shift + C`, а не обычная `Ctrl + C`, чтобы никогда не перехватывать нативное копирование.

---

## Тестирование

```bash
npm run test          # 600 unit/integration тестов в 47 файлах
npm run test:watch    # Watch mode
npm run test:e2e      # 49 Playwright E2E тестов в 12 spec-файлах
```

**Покрытие:** утилиты, база данных, безопасность, компоненты, задачи, QaAgent, circuit breaker, zip-парсер, property-based (10k итераций).

---

## Деплой

### GitHub Pages
Пуш в `master` запускает `.github/workflows/deploy.yml`, который собирает проект с `VITE_BASE=/drafter/` и публикует на https://ssrjkk.github.io/drafter/.

### Vercel / Netlify
Пуш в GitHub, подключаешь репо, автодеплой. Build command: `npm run build`, output: `dist/`.

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
# Обслуживай dist/ любым статическим сервером (nginx, Apache, Caddy)
```

---

## Технологический стек

| Слой | Технология |
|------|-----------|
| UI | React 18.3, TypeScript 5.7, TailwindCSS 3.4 |
| Состояние | Zustand 5 + immer |
| База данных | sql.js 1.10 (SQLite WASM) + IndexedDB |
| PDF | jsPDF 4 |
| Архивы | JSZip |
| Виртуализация | @tanstack/react-virtual |
| Тестирование | Vitest, Playwright, @testing-library |
| Сборка | Vite 5, esbuild |
| CI | GitHub Actions (typecheck, lint, test, build, E2E, Lighthouse, Docker) |
| Качество | ESLint 9, Commitlint, Husky, lint-staged |

Размеры бандла и CSS печатает `npm run build`; `npm run analyze` создаёт визуализацию бандла.

---

## Лимиты

| Ресурс | Лимит |
|--------|-------|
| Длина контекста | 10,000 символов |
| Rate limit | 10 запросов/минуту |
| Загрузка скриншотов | 5MB максимум |
| История сессий | 50 записей |

---

## Переменные окружения

Все опциональные — настраиваются через модалку в приложении.

```env
# .env (опционально)
VITE_API_URL=https://api.anthropic.com/v1/messages
VITE_MODEL=claude-sonnet-4-20250514
VITE_MAX_TOKENS=8192
VITE_BASE=/drafter/          # базовый путь для собранного приложения
TEST_MASTER_PASSWORD=secret  # только для E2E тестов
```

---

## Контрибьюция

1. Форкни репозиторий
2. Создай ветку: `git checkout -b feature/amazing-feature`
3. Вноси изменения (убедись что `npm run lint` и `npm run test` проходят)
4. Коммить по conventional format: `git commit -m 'feat: add amazing feature'`
5. Пушь и создай Pull Request

### Разработка

```bash
npm install
npm run dev          # Запуск dev-сервера
npm run lint         # Проверка линтинга
npm run typecheck    # Проверка типов
npm run test         # Запуск тестов
npm run test:e2e     # Запуск E2E тестов
```

---

## Лицензия

MIT License. Copyright (c) 2026 ssrjkk. Подробности в [LICENSE](LICENSE).

---

## Автор

**ssrjkk** — QA Engineer & Software Developer

- Telegram: [@ssrjkk](https://t.me/ssrjkk)
- GitHub: [ssrjkk](https://github.com/ssrjkk)
- Email: ray013lefe@gmail.com

---

<div align="center">

**Создано с заботой для QA-сообщества.**

</div>
