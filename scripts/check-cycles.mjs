#!/usr/bin/env node
/**
 * Fails on runtime import cycles between our own modules (Metro warns
 * "Require cycles are allowed, but can result in uninitialized values").
 * Type-only imports are erased at build time, so they are ignored, as are
 * package imports. Usage: node scripts/check-cycles.mjs [dir ...]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['packages/shared/src', 'packages/engine/src', 'apps/server/src', 'apps/mobile/src'];
const EXT = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) {
      if (f !== '__tests__' && f !== 'node_modules') walk(p);
    } else if (/\.tsx?$/.test(f) && !f.endsWith('.d.ts')) files.push(p);
  }
};
for (const d of dirs) walk(resolve(root, d));

const resolveImport = (from, spec) => {
  const base = resolve(dirname(from), spec);
  for (const e of ['', ...EXT]) if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
  return null;
};

const graph = new Map();
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const deps = [];
  // import x from './y' / export * from './y' — but not `import type` / `export type`.
  const re = /^\s*(import|export)\s+(?!type\b)([^'"]*?\sfrom\s+)?['"](\.[^'"]+)['"]/gm;
  for (const m of src.matchAll(re)) {
    // `import { type A, type B } from` is erased entirely when every specifier is a type.
    const clause = m[2] ?? '';
    const named = clause.match(/\{([^}]*)\}/);
    if (named && !/^\s*\w/.test(clause.replace(/\{[^}]*\}/, '')) && named[1].split(',').every((s) => !s.trim() || /^\s*type\s/.test(s))) continue;
    const target = resolveImport(f, m[3]);
    if (target) deps.push(target);
  }
  graph.set(f, deps);
}

const cycles = [];
const state = new Map();
const stack = [];
const visit = (n) => {
  state.set(n, 1);
  stack.push(n);
  for (const d of graph.get(n) ?? []) {
    if (state.get(d) === 1) cycles.push([...stack.slice(stack.indexOf(d)), d]);
    else if (!state.get(d)) visit(d);
  }
  stack.pop();
  state.set(n, 2);
};
for (const f of graph.keys()) if (!state.get(f)) visit(f);

if (cycles.length) {
  console.error(`Found ${cycles.length} import cycle(s):`);
  for (const c of cycles) console.error('  ' + c.map((p) => relative(root, p)).join('\n    → '));
  process.exit(1);
}
console.log(`No import cycles in ${files.length} files.`);
