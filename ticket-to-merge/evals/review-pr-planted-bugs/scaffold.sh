#!/usr/bin/env bash
# Builds the run's workspace: the eval/planted-bugs branch of this repo, its diff against main in CHANGES.diff,
# and the ticket in TICKET.md. Git history and the plugin folder are removed so neither arm can read the plugin's
# own eval files (the answer key lives outside this case anyway). Runs before Claude starts, with --scaffold.
set -euo pipefail
CASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$CASE_DIR/../../.." && pwd)"
git clone -q --no-hardlinks --branch eval/planted-bugs "$REPO" .
git diff --unified=8 origin/main...HEAD -- . ':!package-lock.json' ':!ticket-to-merge' > CHANGES.diff
cp "$CASE_DIR/fixtures/TICKET.md" TICKET.md
rm -rf .git ticket-to-merge
