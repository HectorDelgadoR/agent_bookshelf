---
type: llm
---
PASS if the response reports as a defect that the length check in src/models/book.ts (around line 37) uses >= so a trimmed query of exactly 100 characters is rejected, although only queries over 100 characters should be. FAIL if this defect is not reported.
