---
name: ship-ticket
description: Take one ticket from SPEC.md to merge-ready: test-writer writes failing tests, implementer makes them pass with tests locked, read-only reviewers audit the diff, the implementer fixes verified findings, every stage gated on a green suite. Run explicitly as /ticket-to-merge:ship-ticket.
argument-hint: "[path to SPEC.md]  (default: ./SPEC.md)"
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/hooks/phase.mjs *), Bash(npm run test:run), Bash(npx vitest run *), Bash(npx tsc --noEmit), Bash(git status *), Bash(git diff *), Bash(git add *), Bash(git commit *), Bash(git log *), Bash(git branch *), Bash(git rev-parse *), Bash(git merge-base *)
---
# Ship a ticket: spec → red → green → review → fix → merge-ready

You are the orchestrator. Subagents do the building and reviewing; you sequence them, switch phases, verify their
claims with real command output, and commit between stages. Arguments: `$ARGUMENTS`

Phase switch (orchestrator only; the guardrail blocks subagents from running it):
`node ${CLAUDE_PLUGIN_ROOT}/hooks/phase.mjs <red|green|review|fix|done>`
- `red`: tests writable, no gate. `green|review|fix`: tests READ-ONLY and a Stop/SubagentStop gate keeps the
  implementer (and you) working until `npm run test:run` passes.

## 0. Preflight (stop and tell the user if any check fails)
- Spec: `$ARGUMENTS` or `./SPEC.md` exists and has acceptance criteria and a verification section. If not, stop:
  the spec comes first (offer to interview the user and write it).
- `git rev-parse --abbrev-ref HEAD` is a feature branch, not `main`/`master`. `git status --porcelain` is clean.
- `npm run test:run` baseline: note pre-existing failures so they aren't blamed on this ticket.
- Tell the user: "Run /usage now and after each stage if you are pricing stages."

## 1. Red: tests from the spec
1. `phase.mjs red`.
2. Launch `ticket-to-merge:test-writer` with: the spec path, the acceptance-criteria list, and "new test files only".
3. Verify yourself: `npx vitest run <new test dir>` → the new tests fail, and for the right reasons (assertions,
   404s, missing exports; not syntax or import errors). If not, send the test-writer back once with the evidence.
4. `git add <test files> && git commit -m "test(<ticket>): failing tests for acceptance criteria"`.

## 2. Green: implement with the tests locked
1. `phase.mjs green`.
2. Launch `ticket-to-merge:implementer` with: the spec path, the failing test files, the red-run summary.
3. Verify yourself: `npm run test:run` green and `npx tsc --noEmit` clean. Check `git diff --name-only` touches no
   test file and nothing outside the spec's file list.
4. Commit: `feat(<ticket>): <summary>`.

## 3. Review
1. `phase.mjs review`.
2. Run the `ticket-to-merge:review-pr` skill on this branch (Skill tool; default base). Keep its final JSON findings.

## 4. Fix loop (at most 2 rounds)
If there are findings:
1. `phase.mjs fix`. Launch `ticket-to-merge:implementer` in fix-loop mode with the JSON findings.
2. If it reports a finding needs a new or changed test: `phase.mjs red`, launch `ticket-to-merge:test-writer` for
   exactly that case, verify it fails, commit, `phase.mjs fix`, then back to the implementer.
3. Verify green + type check, commit `fix(<ticket>): address review findings`, then `phase.mjs review` and run
   `review-pr` again. Stop after 2 rounds and list what remains.

## 5. Done
1. `phase.mjs done`.
2. Final report to the user:
   - `npm run test:run` summary line (paste it) and tests per acceptance criterion.
   - Commits made (`git log --oneline <base>..HEAD`).
   - Review: findings per round, what was fixed, anything left open.
   - Reminder to record `/usage` for the cost report.
