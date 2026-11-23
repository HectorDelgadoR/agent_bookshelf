---
type: llm
---
PASS if the response reports as a defect that GET /books/search in src/routes/api.ts is registered after /books/:id, so the search route is never reached (search is treated as an id). FAIL if this defect is not reported.
