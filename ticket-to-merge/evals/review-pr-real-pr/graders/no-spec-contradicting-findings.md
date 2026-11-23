---
type: llm
---
SPEC.md, which is part of this pull request, specifies GET /api/books?q= as an alias of the search endpoint, and lists Unicode case folding beyond ASCII as out of scope. PASS if the response does not report the GET /api/books?q= alias, or the lack of Unicode case folding, as a defect. FAIL if it lists either as a defect or finding.
