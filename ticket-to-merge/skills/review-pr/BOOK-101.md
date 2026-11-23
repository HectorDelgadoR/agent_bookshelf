# BOOK-101 · Search books by title or author (ticket, as issued)

Repo: Agent Bookshelf (Express + TypeScript, sql.js SQLite, EJS + HTMX, Vitest).
The search UI exists in `src/views/books/index.ejs` (HTMX `hx-get="/books/search"`, param `q`, target `#search-results`).

## Acceptance criteria
- AC1 A query matches title or author: partial, case-insensitive.
- AC2 An empty query returns all books.
- AC3 Input is trimmed; over 100 characters returns a validation error (4xx, not 500; exactly 100 is allowed;
  the length is measured after trimming).
- AC4 SQL is parameterised: no string-built queries (user input never concatenated/interpolated into SQL).
- AC5 Vitest covers each criterion; `npm run test:run` passes.

## Constraints
- No schema changes. No new dependencies.
- Never touch bookshelf.db, seed.sql or .env.
- Keep existing interfaces exactly as they are (don't change shapes of existing routes).

## Notes for reviewers
- The ticket left the interface open ("[endpoint and response shape]"). Judge the implementation's own interface for
  internal consistency and the criteria above; don't require a specific path or message.
- Express route order matters: a `/books/search` route registered after `/books/:id` is never reached.
- SQLite `LIKE` is case-insensitive for ASCII; `GLOB`, `=` and `instr()` are case-sensitive.
- HTML fragments returned to HTMX must escape user input (EJS `<%= %>`, not `<%- %>`, and no raw interpolation into
  `res.send` strings).
