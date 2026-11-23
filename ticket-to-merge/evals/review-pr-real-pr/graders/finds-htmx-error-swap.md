---
type: llm
---
PASS if the response reports as a defect that the HTML search route's validation error (the <p class="error"> fragment sent with HTTP 400 from src/routes/books.ts) is never shown to the user, because HTMX does not swap 4xx responses into #search-results by default. FAIL if this is not reported.
