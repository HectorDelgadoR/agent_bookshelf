#!/usr/bin/env node
// ticket-to-merge · PreToolUse guardrail
//
// Blocks (exit 2, reason on stderr) any tool call that could modify:
//   - bookshelf.db (and -wal / -shm), seed.sql, .env* (reading .env is blocked too: secrets)
//   - the guardrail itself (this plugin's hooks/, .claude/settings*.json)
//   - tests/ while the pipeline is past the red phase (.ticket-to-merge/phase = green|review|fix)
// It also blocks starting the server (it writes ./bookshelf.db) and common obfuscation tricks.
// Fails closed: if the hook itself errors, the call is blocked.

import { readFileSync, existsSync, realpathSync, appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PROTECTED_LITERALS = ['seed.sql', 'bookshelf.db'];
const WRITE_GLOB_CANDIDATES = ['seed.sql', 'bookshelf.db', 'bookshelf.db-wal', 'bookshelf.db-shm', 'hooks.json', 'protect.mjs', 'settings.json', 'settings.local.json'];
const ENV_GLOB_CANDIDATES = ['.env', '.env.local', '.env.production'];
const SELF_LITERALS = ['protect.mjs', 'hooks.json', '.claude/settings.json', '.claude/settings.local.json', '.claude\\settings'];
const PHASE_REL = path.join('.ticket-to-merge', 'phase');
const LOCKED_PHASES = new Set(['green', 'review', 'fix']);

// ---------- helpers ----------
const lower = (s) => String(s ?? '').toLowerCase();

export function isProtectedBasename(base) {
  const b = lower(base);
  if (b === 'seed.sql') return true;
  if (/^bookshelf\.db($|[-.])/.test(b)) return true;
  if (/^\.env($|\.)/.test(b) && b !== '.env.example') return true;
  return false;
}

const ENV_RE = /(^|[\s/\\=<>|;&(:,`])\.env(\.(?!example\b)[a-z0-9_-]+)?(?=$|[\s;&|)<>,/`])/;
const WRITE_VERB_RE = /\s-(delete|exec|execdir|ok|fprint)\b|(^|[\s;&|(`])(rm|rmdir|mv|cp|dd|tee|truncate|shred|unlink|ln|chmod|chown|touch|install|rsync|xargs|sqlite3|patch|remove-item|set-content|add-content|clear-content|out-file|copy-item|move-item|rename-item|new-item|sed\s+(-[a-z]*\s+)*-[a-z]*i|perl\s+-[a-z]*i|git\s+(rm|mv|checkout|restore|reset|clean|stash|apply|am|cherry-pick|revert|merge|rebase|pull))\b|>(?!&|\s*\/dev\/null)/;

function realish(p) {
  try { return realpathSync(p); } catch { /* not there yet */ }
  try { return path.join(realpathSync(path.dirname(p)), path.basename(p)); } catch { return p; }
}

// Expand simple bash brace lists: a{b,c}d -> abd acd (nested ok, bounded).
export function braceExpand(s, depth = 0) {
  if (depth > 6) return [s];
  const m = s.match(/\{([^{}]*,[^{}]*)\}/);
  if (!m) return [s];
  const out = [];
  for (const alt of m[1].split(',')) {
    out.push(...braceExpand(s.slice(0, m.index) + alt + s.slice(m.index + m[0].length), depth + 1));
    if (out.length > 256) break;
  }
  return out;
}

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const end = glob.indexOf(']', i + 1);
      if (end === -1) { re += '\\['; continue; }
      let cls = glob.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\');
      re += `[${cls}]`;
      i = end;
    } else re += c.replace(/[.+^${}()|\\\/]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

// Quotes, ANSI-C $'..' prefixes and backslash escapes removed: what the shell would actually see.
export const unquote = (cmd) => lower(cmd).replace(/\$(['"])/g, '$1').replace(/['"\\]/g, '');

// Variants of a shell command with quoting / escaping / splicing tricks removed.
export function commandVariants(cmd) {
  const raw = lower(cmd);
  const unquoted = unquote(cmd);
  const variants = new Set([raw, unquoted]);
  for (const tok of unquoted.split(/\s+/)) for (const e of braceExpand(tok)) variants.add(e);
  // Squashed: drop concatenation/splicing noise so 's'+'eed.sql' or seed.s{q,}l collapse.
  variants.add(unquoted.replace(/[\s+,{}()`$|;&]/g, ''));
  return [...variants];
}

// ---------- Bash analysis ----------
export function analyzeBash(cmd, { lockOn = false, isSubagent = false, isPowerShell = false } = {}) {
  const raw = lower(cmd);
  const vars = commandVariants(cmd);
  const unquoted = unquote(cmd);

  // 1. Obfuscation primitives: no legitimate use in this workflow.
  const obfuscation = [
    [/\bbase64\b[^\n]*\s(-d|--decode|-D)\b/i, 'base64 decoding'],
    [/(^|[;&|(`]\s*)eval\b/, 'eval'],
    [/\bxxd\b[^\n]*\s-r\b/, 'xxd -r'],
    [/\\x[0-9a-f]{2}|\\[0-3][0-7]{2}|\\u[0-9a-f]{4}/, 'escaped byte sequences'],
    [/fromcharcode|\batob\s*\(|buffer\.from\([^)]*base64|\bchr\s*\(|\bunhexlify\b/, 'string decoding'],
    [/(^|[|;&]\s*)rev(\s|$)/, 'rev'],
  ];
  for (const [re, what] of obfuscation) if (re.test(raw)) return `Command uses ${what}; obfuscated commands are blocked by the ticket-to-merge guardrail.`;

  // 2. Literal protected names in any de-obfuscated variant.
  for (const v of vars) {
    for (const lit of PROTECTED_LITERALS) if (v.includes(lit)) return `Command references protected file "${lit}". bookshelf.db, seed.sql and .env must never be touched.`;
    if (ENV_RE.test(v)) return 'Command references a protected .env file. .env must never be read or modified.';
  }
  for (const v of vars) for (const lit of SELF_LITERALS) if (v.includes(lit)) return `Command references the guardrail configuration (${lit}); it cannot be changed by the agent.`;

  // 3. Globs that could expand to a protected file.
  //    - A glob that could reach .env is blocked even for reads (secrets). In bash a leading `*`/`?` never
  //      matches a dotfile, so only patterns that start with "." can; PowerShell wildcards do match dotfiles.
  //    - A glob that could reach seed.sql / bookshelf.db / the guardrail is blocked only when the command also
  //      writes. Read-only globs (e.g. git pathspecs like ':(exclude)ticket-to-merge/**') are harmless.
  const writes = WRITE_VERB_RE.test(unquoted);
  // Tokenise twice: with backslashes removed (bash escapes) and with backslashes as path separators (Windows paths).
  const slashed = lower(cmd).replace(/\$(['"])/g, '$1').replace(/['"]/g, '').replace(/\\/g, '/');
  for (const tokRaw of [...unquoted.split(/[\s;&|()<>`=]+/), ...slashed.split(/[\s;&|()<>`=]+/)]) {
    for (const tok of braceExpand(tokRaw)) {
      if (!/[*?[]/.test(tok) || tok === '[' || tok === '[[') continue;
      const base = tok.split(/[\\/]/).pop();
      if (!base) continue;
      let re; try { re = globToRegex(base); } catch { continue; }
      const envHit = ENV_GLOB_CANDIDATES.find((c) => re.test(c) && (isPowerShell || base.startsWith('.')));
      if (envHit) return `Glob "${tok}" could match protected file "${envHit}". .env must never be read or modified.`;
      const hit = writes && WRITE_GLOB_CANDIDATES.find((c) => re.test(c));
      if (hit) return `Glob "${tok}" in a command that writes could match protected file "${hit}". Name files explicitly.`;
    }
  }

  // 4. Variable / command-substitution splicing around protected stems or extensions.
  const splices = /\$[a-z_{(]|`/.test(raw);
  if (splices && /(\.sql|\.db\b|\.env|seed|bookshelf(?![a-z0-9_-]*\/))/.test(unquoted.replace(/agent[_-]bookshelf/g, ''))) {
    return 'Command builds a path with variables or substitution near a protected name (.sql/.db/.env/seed); blocked.';
  }

  // 5. Destructive verb + protected stem (e.g. `ls | grep seed | xargs rm`).
  const stem = /(^|[^a-z0-9_-])(seed|bookshelf)([^a-z0-9_/-]|$)/.test(unquoted.replace(/agent[_-]bookshelf/g, ''));
  if (stem && WRITE_VERB_RE.test(unquoted)) return 'Destructive command near a protected name (seed/bookshelf); blocked.';

  // 6. Starting the app writes ./bookshelf.db.
  if (/\bnpm\s+(start|run\s+(dev|start))\b|\bnpx\s+agent-bookshelf\b|\bnode\s+(\.\/)?(dist\/server|bin\/agent-bookshelf)|\btsx\s+(watch\s+)?(\.\/)?src\/server/.test(unquoted)) {
    return 'Starting the server writes ./bookshelf.db. Verify behaviour with `npm run test:run` instead.';
  }
  if (/\bgit\s+clean\b[^\n]*\s-[a-z]*x/i.test(cmd)) return 'git clean -x would delete ignored files such as bookshelf.db; blocked.';

  // 7. Test lock (TDD green phase): tests/ is read-only, and only the orchestrator toggles the lock.
  if (/phase\.mjs/.test(unquoted) && isSubagent) return 'Only the orchestrating session may change the pipeline phase (and with it the test lock).';
  if (/(^|[^a-z0-9_-])\.ticket-to-merge/.test(unquoted) && WRITE_VERB_RE.test(unquoted) && !/phase\.mjs/.test(unquoted)) {
    return 'The .ticket-to-merge/ state directory is managed by the plugin; blocked.';
  }
  if (lockOn && WRITE_VERB_RE.test(unquoted) && /(^|[\s/=])tests\/|\.(test|spec)\.[cm]?[jt]s/.test(unquoted)) {
    return 'Tests are read-only while implementing (test lock is on). Make the code pass the tests instead of changing them.';
  }
  return null;
}

// ---------- file-tool analysis ----------
const WRITE_API_RE = /\b(writefile(sync)?|appendfile(sync)?|unlink(sync)?|rm(sync)?|rmdir(sync)?|rename(sync)?|copyfile(sync)?|truncate(sync)?|createwritestream|open(sync)?\s*\([^)]*['"][wa+])/;

export function analyzeFileTool(tool, toolInput, cwd, { lockOn = false } = {}) {
  const fp = toolInput.file_path || toolInput.notebook_path || toolInput.path;
  if (fp) {
    const abs = path.resolve(cwd, fp);
    const real = realish(abs);
    for (const p of [abs, real]) {
      const base = path.basename(p);
      const l = lower(p).replace(/\\/g, '/');
      if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') {
        if (/^\.env($|\.)/.test(lower(base)) && lower(base) !== '.env.example') return '.env holds secrets and is not readable by agents.';
        continue;
      }
      if (isProtectedBasename(base)) return `${base} is protected (bookshelf.db, seed.sql and .env must never be touched).`;
      if (/\/ticket-to-merge\/hooks\//.test(l) || /\/\.claude\/settings(\.local)?\.json$/.test(l)) return 'The guardrail configuration cannot be modified by the agent.';
      if (/\/\.ticket-to-merge\//.test(l)) return 'The .ticket-to-merge/ state directory is managed by the plugin.';
      if (lockOn && (/\/tests\//.test(l) || /\.(test|spec)\.[cm]?[jt]s$/.test(l))) {
        return 'Tests are read-only while implementing (test lock is on). Make the code pass the tests instead of changing them.';
      }
    }
  }
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return null;
  // Content that would later write a protected file when executed (e.g. a helper script).
  const content = lower([toolInput.content, toolInput.new_string, toolInput.new_source, ...(toolInput.edits || []).map((e) => e.new_string)].filter(Boolean).join('\n'));
  if (content && WRITE_API_RE.test(content)) {
    const squashed = content.replace(/['"`\s+]/g, '');
    if (PROTECTED_LITERALS.some((l) => squashed.includes(l)) || /['"`/]\.env['"`]/.test(content)) {
      return 'New code would write to a protected file (seed.sql / bookshelf.db / .env); blocked.';
    }
  }
  return null;
}

// ---------- main ----------
function log(cwd, entry) {
  try {
    const dir = path.join(cwd, '.ticket-to-merge');
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, 'guardrail.log'), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch { /* logging must never break the hook */ }
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {
    process.stderr.write('ticket-to-merge guardrail: unreadable hook input; blocking to be safe.\n');
    process.exit(2);
  }
  const tool = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || process.cwd();
  let phase = '';
  try { phase = readFileSync(path.join(cwd, PHASE_REL), 'utf8').trim(); } catch { /* no pipeline running */ }
  const lockOn = LOCKED_PHASES.has(phase);
  const isSubagent = Boolean(input.agent_id || input.agent_type);

  let reason = null;
  if (tool === 'Bash' || tool === 'PowerShell') reason = analyzeBash(toolInput.command || '', { lockOn, isSubagent, isPowerShell: tool === 'PowerShell' });
  else reason = analyzeFileTool(tool, toolInput, cwd, { lockOn });

  if (reason) {
    log(cwd, { blocked: true, tool, agent: input.agent_type || 'main', reason, input: toolInput.command || toolInput.file_path });
    process.stderr.write(`BLOCKED by ticket-to-merge guardrail: ${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'));
if (isMain) {
  try { main(); } catch (err) {
    process.stderr.write(`ticket-to-merge guardrail error (failing closed): ${err?.message}\n`);
    process.exit(2);
  }
}
