#!/usr/bin/env node
/*
 * Literal-colour audit for the Chalk & Brass shell.
 *
 *   node .qoder/skills/gymcore-shell/scripts/audit-shell-colors.mjs [paths…] [--counts] [--limit N] [--all]
 *
 * Default path is `src`. Finds Tailwind palette utilities, arbitrary hex/rgb
 * values, and hardcoded hex in style props — the three ways a component escapes
 * the single colour source in tokens.css. Comment lines are skipped unless --all.
 * Always exits 0; the RESULT line is the machine-readable verdict.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PALETTE =
  'white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|rose';
const UTILITY =
  'bg|text|border|ring|from|via|to|fill|stroke|shadow|divide|placeholder|outline|decoration|accent';
const RE_UTILITY = new RegExp(
  `(?<![-\\w])((?:${UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d{1,3})?)(?![\\w-])`,
  'g',
);
const RE_ARBITRARY = /(?:bg|text|border|ring|from|to|fill|stroke|shadow)-\[(?:#|rgb|hsl)/g;
const RE_HEX = /(['"`])\s*#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\s*\1/g;

const FIX = {
  'bg-white': 'bg-card',
  'bg-gray-50': 'bg-surface-container-low',
  'bg-gray-100': 'bg-muted',
  'text-gray-900': 'text-foreground',
  'text-gray-600': 'text-muted-foreground',
  'text-gray-500': 'text-muted-foreground',
  'text-gray-400': 'text-ink-faint',
  'border-gray-100': 'border-hairline',
  'border-gray-200': 'border-input',
  'text-emerald-600': 'text-primary',
  'text-emerald-700': 'text-primary',
  'bg-emerald-500': 'bg-primary',
  'bg-emerald-50': 'bg-primary/10',
  'border-emerald-200': 'border-primary/30',
  'border-emerald-500': 'border-primary',
  'ring-emerald-500': 'ring-ring',
  'shadow-sm': 'delete (shell cards are flat)',
  'shadow-lg': 'delete (shell cards are flat)',
};

const EXTS = new Set(['.ts', '.tsx', '.css']);
const SKIP = new Set(['node_modules', 'dist', '.git', 'build', 'coverage']);

function walk(target, out) {
  let st;
  try {
    st = statSync(target);
  } catch {
    return out;
  }
  if (st.isFile()) {
    if (EXTS.has(target.slice(target.lastIndexOf('.')))) out.push(target);
    return out;
  }
  for (const entry of readdirSync(target)) {
    if (SKIP.has(entry)) continue;
    walk(join(target, entry), out);
  }
  return out;
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const showCountsOnly = flags.has('--counts');
const includeComments = flags.has('--all');
const limitIdx = argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(argv[limitIdx + 1]) || 40 : 40;
const paths = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const roots = paths.length ? paths : ['src'];

const files = [];
for (const root of roots) walk(root, files);

const findings = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const isComment =
      trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
    if (isComment && !includeComments) return;
    const hits = new Set();
    for (const m of line.matchAll(RE_UTILITY)) hits.add(m[1]);
    for (const m of line.matchAll(RE_ARBITRARY)) hits.add(`${m[0].replace(/-\[.*/, '-[…]')} (arbitrary value)`);
    for (const m of line.matchAll(RE_HEX)) hits.add(`${m[0].slice(1, -1).trim()} (hex literal)`);
    if (hits.size) {
      findings.push({ file: relative(process.cwd(), file).split(sep).join('/'), line: idx + 1, hits: [...hits] });
    }
  });
}

const tally = new Map();
for (const f of findings) for (const h of f.hits) tally.set(h, (tally.get(h) || 0) + 1);
const byFile = new Map();
for (const f of findings) byFile.set(f.file, (byFile.get(f.file) || 0) + 1);

if (showCountsOnly) {
  for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(n).padStart(4)}  ${file}`);
  }
} else {
  for (const f of findings.slice(0, LIMIT)) {
    console.log(`${f.file}:${f.line}`);
    for (const h of f.hits) {
      const base = h.replace(/\/\d+$/, '');
      const fix = FIX[base] ?? FIX[h];
      console.log(`        ${h}${fix ? `  ->  ${fix}` : ''}`);
    }
  }
  if (findings.length > LIMIT) {
    console.log(`… ${findings.length - LIMIT} more findings (raise --limit or use --counts)`);
  }
}

console.log(
  `\nRESULT: ${findings.length ? findings.length : 0} finding(s) in ${byFile.size} file(s), ` +
    `${tally.size} distinct class(es), scanned ${files.length} file(s)` +
    `${includeComments ? ' (comments included)' : ''}`,
);
const top = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 5);
if (top.length) {
  console.log('TOP:');
  for (const [name, n] of top) {
    const fix = FIX[name.replace(/\/\d+$/, '')] ?? FIX[name];
    console.log(`  ${String(n).padStart(4)}  ${name}${fix ? `  ->  ${fix}` : ''}`);
  }
}
console.log(findings.length ? 'VERDICT: off-shell colours present' : 'VERDICT: clean');
