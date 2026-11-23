#!/usr/bin/env node
// ticket-to-merge · pipeline phase switch (orchestrator only; the guardrail blocks subagents from running it)
//
//   node phase.mjs red      tests are writable, the done-gate is off (tests are expected to fail)
//   node phase.mjs green    tests are READ-ONLY, the done-gate requires `npm run test:run` to pass
//   node phase.mjs review   same lock + gate while reviewers run
//   node phase.mjs fix      same lock + gate while builders address review findings
//   node phase.mjs done     clears the state (unlocks tests, disables the gate)
//   node phase.mjs status   prints the current phase
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PHASES = ['red', 'green', 'review', 'fix'];
const dir = path.join(process.cwd(), '.ticket-to-merge');
const file = path.join(dir, 'phase');
const arg = (process.argv[2] || 'status').toLowerCase();

if (arg === 'status') {
  let p = 'none';
  try { p = readFileSync(file, 'utf8').trim() || 'none'; } catch { /* none */ }
  console.log(`phase: ${p}`);
} else if (arg === 'done') {
  rmSync(file, { force: true });
  rmSync(path.join(dir, 'gate-count'), { force: true });
  console.log('phase: none (tests unlocked, gate off)');
} else if (PHASES.includes(arg)) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, arg + '\n');
  rmSync(path.join(dir, 'gate-count'), { force: true });
  console.log(`phase: ${arg}${arg === 'red' ? ' (tests writable, gate off)' : ' (tests locked, gate on)'}`);
} else {
  console.error(`usage: phase.mjs <${[...PHASES, 'done', 'status'].join('|')}>`);
  process.exit(1);
}
