# Agent Bookshelf — Claude Code guide

Goodreads-lite teaching app: Express + TypeScript (ESM), SQLite via sql.js (WASM), EJS + HTMX, Vitest + supertest.

## Commands
- Tests (the gate for "done"): `npm run test:run`
- Single file: `npx vitest run tests/search/book-search.api.test.ts`
- Type check: `npx tsc --noEmit`
- Build: `npm run build` (tsc + copy assets into `dist/`)
- Do **not** start the server (`npm start`, `npm run dev`, `npx agent-bookshelf`): it writes `./bookshelf.db`. Verify with tests.

## Never
- Never touch `bookshelf.db*`, `src/db/seed.sql` or `.env*` (the plugin hook blocks it).
- No schema changes (`src/db/schema.sql` stays as is). No new dependencies (`package.json` stays as is).
- No string-built SQL: every user value goes through `?` parameters.
- Don't edit tests while implementing (TDD green phase). If a test looks wrong, stop and report it.
- Don't change existing endpoint shapes.

## Layout
- `src/db/index.ts` — `initDb(path)`, `all/get/run(sql, params)` helpers. Always pass params.
- `src/models/*.ts` — data access. `src/routes/api.ts` JSON API; `src/routes/books.ts` HTML + HTMX fragments.
- `src/views/**/*.ejs` — use `<%= %>` (escaped) for user/DB values; `<%- %>` only for includes.
- `tests/**/*.test.ts` — Vitest with `globals: true`.

## Conventions
- ESM imports with `.js` suffix: `import * as Book from '../models/book.js'`.
- API errors: `res.status(4xx).json({ error: '<message>' })`. HTML fragment errors: `<p class="error">…</p>`.
- Specific routes (`/books/search`) go **before** parameterised ones (`/books/:id`).
- Tests: each file gets its own DB under `os.tmpdir()` (unique name), `await initDb(path)` in `beforeEach`,
  `closeDb()` + unlink in `afterEach`. Import `request` from `supertest` and `app` from `src/server.js`.
  Seed data: 50 books, 3 users; book 1 is "The Pragmatic Programmer", "Dune" is by Frank Herbert.

## Current ticket
BOOK-101 search — read `SPEC.md` first; it is the source of truth for interface and edge cases.
