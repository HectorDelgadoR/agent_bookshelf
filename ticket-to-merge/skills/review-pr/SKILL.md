---
name: review-pr
description: Review a branch or PR diff with read-only specialist reviewers (security, correctness vs the ticket) and an adversarial verifier; returns verified JSON findings {file, line, severity, issue, evidence}. Use to review a PR, a branch, or the review stage of /ticket-to-merge:ship-ticket.
argument-hint: "[base-ref | PR number]  (default: merge-base with main)"
allowed-tools: Bash(git diff *), Bash(git merge-base *), Bash(git rev-parse *), Bash(git branch *), Bash(git log *), Bash(git status), Bash(git status *), Bash(gh pr diff *), Read, Grep, Glob, Agent, Task
---
# Review a diff: specialists, then a verifier

You orchestrate; the reviewers are read-only subagents. Don't edit any file in this skill.
Arguments: `$ARGUMENTS`

## 1. Get the diff
Run each git command as its own Bash call: no `&&`, `||`, `;`, pipes, `$(...)` or shell variables (they stop the
pre-approved `allowed-tools` patterns from matching). Write the base ref literally into each command.
- A number → `gh pr diff <n>` (if `gh` is unavailable, say so and fall back to the branch diff).
- A ref → use it as `<base>`.
- Nothing → `git merge-base HEAD origin/main`; if that fails, `git merge-base HEAD main`; then `git merge-base HEAD master`.
  Use the printed commit as `<base>`.
- Run `git diff --name-only <base>...HEAD`, then
  `git diff --unified=8 <base>...HEAD -- . ':!package-lock.json' ':!ticket-to-merge'`.
  If `git status --porcelain` shows uncommitted changes to source files, also run `git diff HEAD`.
- Empty diff → report `[]` and stop.

## 2. Get the requirements
- If `SPEC.md` exists at the repo root, it is the spec: acceptance criteria AND interface are requirements.
- Otherwise read `${CLAUDE_SKILL_DIR}/BOOK-101.md` (the ticket). In that case **only the acceptance criteria and
  constraints are requirements**: the implementation's own choice of route path, error message and response shape is
  acceptable as long as it is consistent and the criteria hold. Tell the reviewers this explicitly.

## 3. Run the specialists in parallel
Launch both in ONE message, each with the full diff, the changed-file list and the requirements text pasted
into its prompt (the reviewers have no Bash, so they can't fetch the diff themselves). If the diff is too long to paste
whole, paste the source changes and give the **full changed-file list**, and tell both reviewers explicitly to Read
every changed file that isn't pasted, test files included. Tell `review-correctness` to read every changed file under
`tests/` (and any `*.test.*` / `*.spec.*`) in full: a weakened test is a finding.
- `ticket-to-merge:review-security`
- `ticket-to-merge:review-correctness`

Each returns a JSON array. If one returns invalid JSON, extract the objects you can; don't re-run it.

## 4. Verify
If the combined candidates are non-empty, launch `ticket-to-merge:review-verifier` with: the candidates (as one JSON
array, tagged with which reviewer raised each), the diff, and the requirements. Its output is the final list.
If there are no candidates, the final list is `[]`. Do not add findings of your own after verification.

## 5. Report
Print exactly:
1. A fenced ```json block with the final findings array (`file`, `line`, `severity`, `issue`, `evidence`), most severe
   first. This block is the review result.
2. A short table: severity · file:line · issue.
3. One line: `Reviewed <N> files against <SPEC.md | BOOK-101 ticket>: <k> findings (<candidates> candidates, <dropped> dropped by the verifier).`
