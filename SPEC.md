# SPEC · BOOK-101 · Search books by title or author

## Goal
Let a user (HTML search box) or an API client find books whose **title or author** contains a query,
partially and case-insensitively. The UI already exists (`src/views/books/index.ejs`, HTMX `hx-get="/books/search"`);
the backend is a TODO in `src/routes/books.ts`.

## Acceptance criteria (from the ticket)
| ID | Criterion |
|----|-----------|
| AC1 | A query matches **title or author**: partial (substring), case-insensitive. |
| AC2 | An **empty query** returns **all books**. |
| AC3 | Input is **trimmed**; a trimmed query **over 100 characters** returns a **validation error**. |
| AC4 | SQL is **parameterised**: no string-built queries. |
| AC5 | **Vitest** covers each criterion; `npm run test:run` passes. |

## Interface
The ticket's interface field was left blank (`[endpoint and response shape]`), so this spec fixes it.
Nothing existing changes shape; the search surfaces are additive.

### Model · `src/models/book.ts`
```ts
export const MAX_SEARCH_QUERY_LENGTH = 100;
export class SearchQueryError extends Error {}          // name === 'SearchQueryError'
export function normalizeSearchQuery(raw: unknown): string; // trims; throws SearchQueryError
export function searchBooks(query: string): Book[];         // validates via normalizeSearchQuery
```
- `undefined` / `null` → `''`. Non-string (e.g. array from `?q=a&q=b`) → `SearchQueryError('Search query must be a string')`.
- Trimmed length `> 100` → `SearchQueryError('Search query must be 100 characters or fewer')`. Exactly 100 is allowed.
- `''` (after trim) → all books, same as `getAllBooks()`.
- Otherwise: `SELECT * FROM books WHERE title LIKE ? ESCAPE '\' OR author LIKE ? ESCAPE '\' ORDER BY title`
  with the pattern `%<escaped query>%`. `%`, `_` and `\` in user input are escaped so they match literally.
- Results are ordered by title (same ordering as `getAllBooks()`), each row is a full `Book`.

### JSON API · `src/routes/api.ts`
| Request | Status | Body |
|---|---|---|
| `GET /api/books/search?q=<query>` | 200 | `Book[]` (same object shape as `GET /api/books`) |
| `GET /api/books/search` (no `q`, or blank) | 200 | all books |
| `GET /api/books/search?q=<101+ chars after trim>` | 400 | `{ "error": "Search query must be 100 characters or fewer" }` |
| `GET /api/books/search?q=a&q=b` | 400 | `{ "error": "Search query must be a string" }` |
| `GET /api/books?q=<query>` | same as `/api/books/search` | alias; without `q` the route behaves exactly as before |

`/api/books/search` must be registered **before** `/api/books/:id`, or `search` is parsed as an id.

### HTML (HTMX) · `src/routes/books.ts`
`GET /books/search?q=<query>` returns an HTML **fragment** swapped into `#search-results`:
- 200 with `<div class="book-grid">` of `.book-card`s (same markup as the index page), rendered by
  `src/views/books/search-results.ejs`. Values are EJS-escaped (`<%= %>`).
- 200 with `<p class="search-message">No books found matching "<query>".</p>` when nothing matches.
- 400 with `<p class="error">Search query must be 100 characters or fewer</p>` on validation errors.

## Constraints
- No schema changes. No new dependencies.
- Never touch `bookshelf.db*`, `src/db/seed.sql` or `.env` (enforced by the plugin's PreToolUse hook).
- Keep existing interfaces exactly as they are.

## Out of scope
- Unicode case folding beyond ASCII (SQLite `LIKE` folds ASCII only: `MIÉVILLE` will not match `Miéville`).
- Multi-word / cross-field matching ("dune herbert"), ranking, pagination, fuzzy search.
- Fixing pre-existing tests that hard-code `/tmp/...` (on Windows they need `C:\tmp` to exist).
- Validation for other API endpoints.

## Files
- `src/models/book.ts` — `normalizeSearchQuery`, `SearchQueryError`, `searchBooks` (rewrite).
- `src/routes/api.ts` — `GET /books/search`, `q` alias on `GET /books`.
- `src/routes/books.ts` — implement `GET /books/search`.
- `src/views/books/search-results.ejs` — new fragment.
- `tests/search/book-search.model.test.ts`, `tests/search/book-search.api.test.ts`,
  `tests/search/book-search.html.test.ts` — new.

## Verification (end-to-end)
1. `npm run test:run` → all green, including every `AC*` test in `tests/search/`.
2. `npx tsc --noEmit` → no type errors.
3. `git diff main --stat` touches only the files listed above (plus docs/plugin).
4. `grep -nE "\\$\\{.*\\}" src/models/book.ts` shows no interpolation inside the search SQL.
