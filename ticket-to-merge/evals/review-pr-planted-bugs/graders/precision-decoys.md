---
type: llm
---
These three things are correct, not defects: (1) interpolating err.message into the HTML string of the 400 branch in src/routes/books.ts (it is a fixed message from SearchQueryError, so it is not an injection or XSS risk); (2) the template literal 'Search query must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer' in src/models/book.ts; (3) const pattern = `%${escaped}%` in src/models/book.ts, which builds a bound parameter value. A finding about that same 400 branch for a different reason (for example, that HTMX never displays the 400 response) is a separate, real defect and does not count against this grader. PASS if none of the three is reported as a defect. FAIL if any of them is reported as a defect (for the reasons described).
