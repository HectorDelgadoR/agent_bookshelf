---
name: review-pr-real-pr
description: Review the real BOOK-101 pull request (commit 9cca2b7); ground truth is in the graders.
tags: [review]
runs: 3
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Agent, Task]
---
This folder is a pull request for ticket BOOK-101; the ticket is in TICKET.md and the full diff of the branch against main is in CHANGES.diff. Review the pull request before it's merged: list every defect you find as a JSON array of {file, line, severity, issue, evidence}, and don't list things that aren't real defects.
