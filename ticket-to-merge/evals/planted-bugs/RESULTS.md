# Planted-bug eval for `/ticket-to-merge:review-pr`

A balanced eval: 6 planted bugs the reviewer **should** flag and 3 clean-but-suspicious decoys it **should not**
(see `answer-key.json`). Run date: 2026-11-23.

## Rebuild the eval branch
```bash
git checkout -b eval/planted-bugs book-101-search
git apply ticket-to-merge/evals/planted-bugs/plant.patch
git rm SPEC.md CLAUDE.md          # force the BOOK-101.md fallback, as on a grader branch
git commit -am "eval: planted bugs"
claude --plugin-dir ./ticket-to-merge    # then: /ticket-to-merge:review-pr main
```

## How it was run
Each run = the `review-pr` procedure: `review-security` ∥ `review-correctness` on the diff `main...eval/planted-bugs`,
then `review-verifier` on their combined candidates. 3 independent runs per configuration. The agents were dispatched
with their exact definition files (`agents/*.md`) and models; see the README note on how this session ran them.

## Results — baseline (all three agents on Sonnet)
| Run | Candidates (sec + corr) | Final findings | Planted found | False positives | Recall | Precision |
|---|---|---|---|---|---|---|
| 1 | 4 + 6 = 10 | 6 | B1 B2 B3 B4 B5 B6 | 0 | 6/6 | 6/6 |
| 2 | 3 + 6 = 9  | 6 | B1 B2 B3 B4 B5 B6 | 0 | 6/6 | 6/6 |
| 3 | 4 + 6 = 10 | 6 | B1 B2 B3 B4 B5 B6 | 0 | 6/6 | 6/6 |

## Results — after the lever (specialists on Haiku, verifier stays on Sonnet)
| Run | Candidates (sec + corr) | Final findings | Planted found | False positives | Recall | Precision |
|---|---|---|---|---|---|---|
| 1 | 4 + 6 = 10 | 6 | B1 B2 B3 B4 B5 B6 | 0 | 6/6 | 6/6 |
| 2 | 4 + 7 = 11 | 6 | B1 B2 B3 B4 B5 B6 | 0 | 6/6 | 6/6 |
| 3 | 3 + 6 = 9  | 6 | B1 B2 B3 B4 B5 B6 | 0 | 6/6 | 6/6 |

## What the numbers hide
- **No reviewer flagged any decoy** in 12 specialist runs, so the verifier never had a false positive to drop; its
  measured value here was **merging duplicates** (every run: 9–11 candidates → 6 findings) and **repairing line
  numbers**: Haiku cited the wrong line 4 times (`book.ts:55`×2, `api.ts:41`, `books.ts:25`); all were corrected
  to the planted line. Without the verifier, the Haiku configuration would report 9–11 findings per run with
  duplicates, which a grader counting findings would score as lower precision.
- **The split matters for recall.** `review-security` alone never found B4 or B6 and missed B3 in 3 of its 6 runs: those
  are spec/test defects. `review-correctness` alone found all 6 in every run; the security reviewer still earns its
  place by catching injection/XSS with stronger evidence and acting as a second vote on B1/B5.
- **Tests vs. reviewer.** On this branch the suite fails 41/90 search tests and so catches B1–B5 by itself; only the
  reviewer catches **B6**, the weakened test (a test can't report its own vacuity).
- **Small eval.** 6 bugs + 3 decoys on one ticket. 100% here doesn't predict 100% on an unseen branch; the next
  step is more decoys that look like real bugs (the hard case for precision).

## Live run of the plugin (Claude Code 2.1.330)
`claude -p "/ticket-to-merge:review-pr main" --plugin-dir ./ticket-to-merge` on `eval/planted-bugs`:
- **First run: returned `[]` (review blocked itself).** The skill's read-only pathspec `':(exclude)ticket-to-merge/**'`
  tripped the guardrail's glob rule. Fixed in `protect.mjs` (protected-file globs only block commands that write;
  `.env` globs still block reads) and in the skill (plain pathspecs, one git command per call). Regression case added
  to the bypass suite (94 cases at the time; 108 after the write-then-execute fix).
- **Re-run after the fix: 6/6 planted bugs at the correct lines, 0 false positives** (10 candidates, 4 duplicates
  merged by the verifier). Measured cost $0.82: orchestrating session on Opus 5.5 $0.62 (84% cache hit), reviewer
  and verifier agents on Sonnet $0.20 (49% cache hit). The orchestrator dominates, so the skill's own model is the
  next lever to test.
