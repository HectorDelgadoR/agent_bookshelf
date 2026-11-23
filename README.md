# Capstone · Ticket to Merge · BOOK-101

**BOOK-101 · Search books by title or author**, taken from zero to merge-ready by agents, packaged as the
`ticket-to-merge` plugin (`./ticket-to-merge`).

| | |
|---|---|
| Repo / branch | [HectorDelgadoR/agent_bookshelf @ book-101-search](https://github.com/HectorDelgadoR/agent_bookshelf/tree/book-101-search) (eval branch: [`eval/planted-bugs`](https://github.com/HectorDelgadoR/agent_bookshelf/tree/eval/planted-bugs)) |
| Spec | [SPEC.md](SPEC.md) (the ticket as a brief: interface, edge cases, out of scope, verification) |
| Conventions | [CLAUDE.md](CLAUDE.md) (commands, never-rules, conventions, 34 lines) |
| Plugin | [ticket-to-merge/](ticket-to-merge/) — entry points `/ticket-to-merge:ship-ticket`, `/ticket-to-merge:review-pr` |
| Eval | [ticket-to-merge/evals/planted-bugs/](ticket-to-merge/evals/planted-bugs/) — answer key, plant patch, results |

## How to run
```bash
npm install
claude plugin validate ./ticket-to-merge
claude --plugin-dir ./ticket-to-merge
# inside Claude Code, on a feature branch with a SPEC.md:
/ticket-to-merge:ship-ticket SPEC.md
# review any branch against main (or pass a base ref / PR number):
/ticket-to-merge:review-pr
/ticket-to-merge:review-pr origin/main
```
`review-pr` uses `SPEC.md` when the branch has one; otherwise it falls back to the bundled ticket
(`skills/review-pr/BOOK-101.md`) and treats only the acceptance criteria and constraints as requirements, so a
grader branch with a different route path or message isn't penalised for it.

## What was built (the ticket)
- `src/models/book.ts` — `normalizeSearchQuery` (string-only, trimmed, ≤ 100 chars after trimming),
  `SearchQueryError`, `MAX_SEARCH_QUERY_LENGTH`; `searchBooks` uses `title LIKE ? ESCAPE '\' OR author LIKE ? ESCAPE '\'`
  with `%`, `_`, `\` escaped; an empty query returns all books.
- `src/routes/api.ts` — `GET /api/books/search?q=` (registered before `/books/:id`) and a `GET /api/books?q=` alias;
  400 `{ "error": … }` on invalid input. `GET /api/books` without `q` is unchanged.
- `src/routes/books.ts` + `src/views/books/search-results.ejs` — the HTMX fragment for the existing search box
  (book cards, an escaped "No books found" message, 400 error fragment).

### Test run (green)
```
$ npm run test:run
 Test Files  6 passed (6)
      Tests  104 passed (104)
$ npx tsc --noEmit        # clean
$ node --test ticket-to-merge/hooks/protect.test.mjs
# pass 108
# fail 0
```
90 of the 104 tests are new (`tests/search/`, one `describe` per acceptance criterion, names prefixed `AC1`…`AC4`;
AC5 is the suite itself). Red run before implementation: 62 failing for the right reasons, 28 regression guards passing.
On Windows the 14 pre-existing tests need `C:\tmp` to exist (they hard-code `/tmp`); the new tests use `os.tmpdir()`.

## Pipeline and commits
| Stage | Who | Evidence |
|---|---|---|
| 1 · Set up | me | `docs(BOOK-101): add SPEC.md and CLAUDE.md`, `feat(plugin): guardrail hook…` |
| 2 · Red | `test-writer` (Sonnet) | `test(BOOK-101): failing tests for acceptance criteria` |
| 2 · Green | `implementer` (Sonnet), tests locked | `feat(BOOK-101): search books by title or author` |
| 3 · Review | `review-security` ∥ `review-correctness` (Sonnet) | both returned `[]` on the real diff → verifier skipped |
| 3 · Fix loop | — | not needed (0 findings) |
| 4 · Prove | planted-bug eval, 3 runs × 2 configs | [RESULTS.md](ticket-to-merge/evals/planted-bugs/RESULTS.md) |

## Guardrails
- **Protected files** (`hooks/protect.mjs`, PreToolUse on `Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell|Read|Grep|Glob`,
  exit 2 to block, `onFailure: block`, fails closed on bad input). Blocks any write to `bookshelf.db*`, `seed.sql`,
  `.env*`, and any read of `.env`. For Bash it checks de-obfuscated variants of the command: quotes/escapes/`$'…'`
  removed, brace expansion, squashed concatenation (`'s'+'eed.sql'`), globs that could expand to a protected file
  (`se*`, `*.sql`, `bookshelf.d?`), variable/`$(…)` splicing near `.sql/.db/.env`, base64/hex/`rev` decoding,
  destructive verbs near a protected stem (`ls | grep seed | xargs rm`), `git clean -x`, and starting the server
  (it writes `./bookshelf.db`). Write/Edit content that would write a protected file when run is blocked too, including
  code that builds the path at run time (char codes, base64/hex, escapes, reversed strings) next to a file write. When a
  command runs a local script (`node x.js`, `python x.py`, `npx tsx x.ts`, `./x.sh`…), the script is read and checked
  the same way before it runs, which closes the two-step "write a script, then run it" bypass. Any edit to the guardrail
  itself (`ticket-to-merge/hooks/`, `.claude/settings*.json`) is blocked.
  **108-case bypass suite**: `node --test ticket-to-merge/hooks/protect.test.mjs` (48 Bash/PowerShell attacks,
  8 write-then-execute attacks, 23 must-allow commands incl. read-only git pathspecs and real test runs, 20 file-tool
  cases, 8 test-lock cases, 1 garbage-input case).
- **Second layer**: `.claude/settings.json` `permissions.deny` for the same paths (deny rules also cover `@` references,
  which skip PreToolUse hooks).
- **Tests read-only while implementing**: `hooks/phase.mjs` sets `.ticket-to-merge/phase`; in `green|review|fix` the
  hook blocks edits to `tests/` and `*.test.*`. Only the main session can change phase: the hook rejects `phase.mjs`
  when the call carries `agent_id` (i.e. comes from a subagent), so an implementer can't unlock its own tests.
- **Gate on done**: `hooks/gate.mjs` on `Stop`/`SubagentStop` re-runs `npm run test:run` during `green|review|fix`
  and blocks (exit 2) with a trimmed failure summary; only implementer/fixer subagents are gated; it gives up after 5
  consecutive blocks so a stuck agent can't loop.
- **Reviewers can't edit**: `tools: Read, Grep, Glob` in each reviewer's frontmatter (plugin agents ignore `hooks` and
  `permissionMode`, so read-only must come from `tools`). No Bash either; the orchestrating skill collects the diff.

## Review quality — planted bugs (3 runs each)
6 planted bugs (SQL injection, `>=` off-by-one, route order, empty query → nothing, XSS via `<%- %>`, a test that
can't fail) + 3 clean decoys that look suspicious. The eval branch has no SPEC.md, like a grader branch.

**Real plugin runs** — `claude -p "/ticket-to-merge:review-pr main" --plugin-dir ./ticket-to-merge` on `eval/planted-bugs`:

| Plugin version | Run 1 | Run 2 | Run 3 | Recall | Precision | Cost / run |
|---|---|---|---|---|---|---|
| v1 (4844087) | 5/6, 1 FP | 5/6, 0 FP | 5/6, 1 FP | 15/18 (83%) | 15/17 (88%) | $0.79 avg |
| **v2, final (5b1a342)** | **6/6, 0 FP** | **6/6, 0 FP** | **5/6, 0 FP** | **17/18 (94%)** | **17/17 (100%)** | **$0.84 avg** |

v1 never found the weakened test (on a long diff the reviewers only got the source changes) and twice flagged a
decoy (a fixed error message in `res.send`, because my own ticket note was worded too broadly). Both were fixed in the
plugin's text, then re-measured: v2. In v2 run 3 neither specialist raised the empty-query bug.

**Development eval** — the same agent definitions and models dispatched as subagents, before the plugin was run for real:

| Configuration | Run 1 | Run 2 | Run 3 | Recall | Precision |
|---|---|---|---|---|---|
| Baseline: specialists + verifier on Sonnet | 6/6, 0 FP | 6/6, 0 FP | 6/6, 0 FP | 100% | 100% |
| Lever: specialists on Haiku, verifier on Sonnet | 6/6, 0 FP | 6/6, 0 FP | 6/6, 0 FP | 100% | 100% |

Details, per-reviewer breakdown, per-run cost and cache hit: [RESULTS.md](ticket-to-merge/evals/planted-bugs/RESULTS.md).
The verifier earned its place by merging duplicates (9–11 candidates → 5–6 findings each run), correcting wrong line
numbers from Haiku, and in v2 dropping the constant-message interpolation that v1 let through.

## Cost report
Build and review rows: **estimated** from the tokens each subagent reported, at list price (Sonnet 5.5 $2/$10,
Haiku 5.5 $0.10/$0.50 per MTok), assuming ~95% input tokens; per-subagent usage doesn't split input/output or report
cache. The last row is **measured**: the usage report of a real `/ticket-to-merge:review-pr` run
(`claude -p … --output-format json`).

| Stage | Cost | Cache hit | Models |
|---|---|---|---|
| Build (red + green) | ~$0.44 est. (183k tok) | n/a¹ | Sonnet: test-writer 108k, implementer 75k |
| Review (real diff) | ~$0.38 est. (157k tok) | n/a¹ | Sonnet: security 77k, correctness 80k; verifier skipped (0 candidates) |
| Fix loop | $0.00 | — | none needed (0 findings) |
| **Total, one ticket** | **~$0.82 est.** | | + orchestrator session (see the measured row)² |
| Review, measured (3 real `/review-pr` runs, v2, planted-bug branch) | **$0.84 / run** | **84–89%** orchestrator · **27–58%** agents | Opus 5.5 orchestrator ~$0.62 · Sonnet reviewers + verifier ~$0.22 |

**One lever: cheaper reviewer model.** Specialists Sonnet → Haiku, verifier kept on Sonnet (it guards precision).

| Review run on the planted-bug branch | Tokens / run | $ / run | Recall | Precision |
|---|---|---|---|---|
| Before (all Sonnet) | 237k | $0.57 | 6/6 ×3 | 6/6 ×3 |
| After (Haiku specialists) | 250k | $0.21 (−63%) | 6/6 ×3 | 6/6 ×3 |

**Did quality hold?** Yes on this eval: same recall and precision in all 3 runs, tests untouched (104/104).
What moved: Haiku used ~8% more tokens, cited wrong line numbers 4 times (verifier fixed all), and produced 2
duplicate findings (verifier merged). On the real diff the lever would cut review from ~$0.38 to ~$0.02.

¹ Cache-hit % isn't exposed per subagent; `/usage` reports the prompt-cache line for the main conversation only.
² The per-agent token counts are dominated by fixed agent context (~75k each: system prompt, tool definitions,
CLAUDE.md), not the diff, which is why every reviewer costs about the same regardless of findings. These runs used a
general-purpose agent harness (see the note below); a plugin agent limited to `Read, Grep, Glob` carries less, so
the next lever is trimming that fixed context.

## Design
**Why this split.**
- *Build: test-writer → implementer, not one agent.* A fresh context that never wrote the code writes tests from the
  acceptance criteria, and the implementer can't weaken them (hook-enforced lock). Split by role, not by layer: the
  ticket touches 4 small files that share one model function; splitting by layer would need worktree isolation and
  a merge step for ~70 lines of code.
- *Review: two specialists + a verifier.* Security and spec-correctness are different reading modes; the eval shows
  it: the security reviewer never found the AC2/test defects, the correctness reviewer found everything, and together
  they vote twice on the high-severity bugs. The verifier exists for precision (4 of the 18 grading points): it
  re-reads the code to refute each candidate, merges duplicates, fixes line numbers.
- *Orchestration in skills, enforcement in hooks.* Skills sequence the agents; anything that must hold every time
  (protected files, test lock, green gate) lives in hooks, not instructions.

**Which models.** Sonnet for test-writer and implementer (precise reading of edge cases; Haiku tests would be the
riskiest saving because every later stage trusts them). Reviewers ship on **Sonnet** for the graded run: the Haiku
lever held quality on my 9-case eval, but that eval is small and the live review is on an unseen branch, so I'd flip
`model: haiku` on the two specialists after a larger eval with harder decoys. Verifier stays on Sonnet either way.

**What I'd cut.** `review-security` is the first cut if cost mattered more than defence in depth: in every run its
findings were a subset of `review-correctness`'s. Next: skip the verifier when the specialists agree on the same set
of findings. I would not cut the test lock or the stop gate: they cost nothing per run and they are what let the
build run unattended.

## How the pipeline was run
`claude plugin validate ./ticket-to-merge` (Claude Code 2.1.330): **✔ Validation passed** — 3 hooks, 2 skills
(`ticket-to-merge:review-pr`, `ticket-to-merge:ship-ticket`) and 5 agents found; the only warning is a missing
marketplace icon (plugin-directory listing check, does not affect the result).

**Live run** of `/ticket-to-merge:review-pr main` on `eval/planted-bugs` with `--plugin-dir ./ticket-to-merge`: the first run
blocked itself (the guardrail read the skill's git pathspec `:(exclude)ticket-to-merge/**` as a dangerous glob); after
that fix a single run returned 6/6, 0 false positives. Three formal runs followed (v1: 15/18, 2 false positives; v2
after fixing the review instructions: 17/18, 0 false positives); see "Review quality" above and
[RESULTS.md](ticket-to-merge/evals/planted-bugs/RESULTS.md).

The build stages (red, green, review) and the 3+3 planted-bug runs were driven from a Claude Code session that
dispatched each stage as a subagent **with the exact agent definition file and model** from `ticket-to-merge/agents/`
and did the orchestrator's checks (phase switches, red/green verification, diff scoping, commits) itself. The hooks
were exercised directly: the 108-case bypass suite and a gate test against passing/failing suites.

## Not done
- Stretch (+5): neither a learning reviewer nor `claude plugin eval` Δ.

---

```
╔═════════════════════════════════════════════╗
║│▓│▒│░│█│▓│░│▒│█│▓│▒│░│█│▓│░│▒│█│▓│▒│░│█│▓│░│║
╠═════════════════════════════════════════════╣
║                                             ║
║     ▄▀█ █▀▀ █▀▀ █▄░█ ▀█▀                    ║
║     █▀█ █▄█ █▄▄ █░▀█ ░█░                    ║
║                                             ║
║     █▄▄ █▀█ █▀█ █▄▀ █▀ █░█ █▀▀ █░░ █▀▀      ║
║     █▄█ █▄█ █▄█ █░█ ▄█ █▀█ █▄▄ █▄▄ █▀░      ║
║                                             ║
║  a goodreads-lite playground for AI agents  ║
║                                             ║
╠═════════════════════════════════════════════╣
║│█│▓│░│▒│█│▓│▒│░│█│▓│░│▒│█│▓│▒│░│█│▓│░│▒│█│▓│║
╚═════════════════════════════════════════════╝
```

# Agent Bookshelf

A Goodreads-lite application designed as a teaching playground for AI agents courses. Students install it locally and use AI agents (Claude Code, etc.) to complete homework assignments.

## Prerequisites

**Node.js 24 LTS** is required.

| OS | Install |
|---|---|
| **macOS** | Download `.pkg` from [nodejs.org](https://nodejs.org) — Universal binary (Intel + Apple Silicon) |
| **Windows** | Download `.msi` from [nodejs.org](https://nodejs.org) — tick "Tools for Native Modules" during install |
| **Linux** | `curl -fsSL https://deb.nodesource.com/setup_24.x \| sudo -E bash - && sudo apt-get install -y nodejs` |

Verify:

```bash
node -v   # should print v24.x.x
npm -v    # should print 11.x.x
```

## Quick Start

### Using npx

```bash
corepack enable
npm install
npm run build
npx agent-bookshelf
```

That's it! The app will start at http://localhost:3000 with pre-seeded data.

## What is this?

Agent Bookshelf is a deliberately structured teaching codebase where:

- **Students** get an easy-to-install app that works immediately
- **AI agents** get a familiar, well-structured codebase to work with
- **Homework gaps** are built in for agents to fill

### Features

- Browse 50 pre-seeded books (tech and sci-fi)
- View book details with reviews and ratings
- Manage user shelves (want-to-read, currently-reading, read)
- Add reviews and ratings
- REST API for agent interaction
- HTMX-powered dynamic UI

### Pre-seeded Data

The app comes with:
- 50 books across tech and sci-fi genres
- 3 users: Alice Chen, Bob Martinez, Carol Okafor
- Sample shelves and reviews
- SQLite database (zero configuration)

## For Students

### Installation

**Prerequisites:** Node.js 20 or higher

**macOS / Linux:**
```bash
npx agent-bookshelf
```

**Windows:**
```bash
npx agent-bookshelf
```

The app will start automatically at http://localhost:3000

### Using the App

1. Browse books at http://localhost:3000
2. Click a book to see details and reviews
3. Visit /shelves to see user bookshelves
4. Add reviews and manage shelves through the UI

### For AI Agents

The app provides a REST API at `/api/*`:

```bash
# Get all books
curl http://localhost:3000/api/books

# Get a specific book
curl http://localhost:3000/api/books/1

# Add a review
curl -X POST http://localhost:3000/api/reviews \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "bookId": 5, "rating": 5, "reviewText": "Excellent!"}'

# Get user shelves
curl http://localhost:3000/api/shelves/user/1
```

See the API routes in `src/routes/api.ts` for full documentation.

## For Instructors

### Homework Gaps

The codebase includes deliberate gaps for homework assignments:

1. **Search functionality** - UI exists but backend is a TODO
   - Location: `src/routes/books.ts` line 14
   - Students can implement the search backend

2. **Missing tests** - Models have no test coverage
   - Location: `tests/` directory
   - QA homework: write test suites for models

3. **Input validation** - API endpoints lack validation
   - Location: `src/routes/api.ts`
   - Students can add validation middleware

4. **UI improvements** - Functional but minimal design
   - Location: `src/public/css/style.css`
   - PM homework: redesign specific components

### Architecture

- **Backend:** Express + TypeScript
- **Database:** SQLite via sql.js (WebAssembly, zero native dependencies)
- **Frontend:** EJS templates + HTMX
- **Testing:** Vitest (setup included, tests are homework)

### Project Structure

```
agent_bookshelf/
├── src/
│   ├── server.ts          # Express app + server
│   ├── db/
│   │   ├── schema.sql     # Database schema
│   │   ├── seed.sql       # Pre-seeded data
│   │   └── index.ts       # DB connection
│   ├── models/            # Data models (no tests - homework gap)
│   ├── routes/
│   │   ├── books.ts       # HTML routes
│   │   ├── shelves.ts
│   │   ├── reviews.ts
│   │   └── api.ts         # JSON API
│   ├── views/             # EJS templates
│   └── public/            # Static assets
├── tests/                 # Vitest setup (tests are homework)
├── bin/                   # CLI entry point
└── docs/adr/              # Architecture decisions
```

### Running Tests

```bash
npm test          # Run tests in watch mode
npm run test:run  # Run tests once
```

Note: The test setup is included, but actual tests are intentionally missing (homework gap).

## License

GPL-3.0

## Contributing

This is a teaching project. Contributions should maintain the deliberate gaps that make homework assignments possible.
