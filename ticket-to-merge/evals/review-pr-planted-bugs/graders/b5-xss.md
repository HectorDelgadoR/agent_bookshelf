---
type: llm
---
PASS if the response reports as a defect that src/views/books/search-results.ejs renders the user's query unescaped with <%- %> (reflected XSS). FAIL if this defect is not reported.
