---
type: llm
---
PASS if the response reports as a defect that the author condition in src/models/book.ts (around line 52) puts the user-derived search pattern into the SQL string by interpolation instead of a bound parameter (SQL injection, or SQL that breaks on a quote). FAIL if this defect is not reported.
