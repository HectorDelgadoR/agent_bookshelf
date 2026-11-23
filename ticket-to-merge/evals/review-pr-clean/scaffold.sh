#!/usr/bin/env bash
# Workspace = the real, correct BOOK-101 implementation (commit 9cca2b7 on book-101-search), its diff against main in
# CHANGES.diff, the ticket in TICKET.md. SPEC.md is part of that PR and stays. Git history and the plugin folder are
# removed. The right answer for this case is "no defects": it measures false positives on clean code.
set -euo pipefail
CASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$CASE_DIR/../../.." && pwd)"
git clone -q --no-hardlinks "$REPO" .
git checkout -q 9cca2b7
git diff --unified=8 origin/main...HEAD -- . ':!package-lock.json' ':!ticket-to-merge' > CHANGES.diff
cp "$CASE_DIR/fixtures/TICKET.md" TICKET.md
rm -rf .git ticket-to-merge
