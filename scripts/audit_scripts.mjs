#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, 'scripts/script_status_manifest.json');

const ALLOWED_STATUSES = new Set(['OK', 'Deprecated']);

const require = createRequire(import.meta.url);
let typescript = null;
try {
  typescript = require(path.join(rootDir, 'apps/server/node_modules/typescript'));
} catch {
  typescript = null;
}

const runCmd = (cmd, args) => {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    encoding: 'utf-8'
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  };
};

const checkTsSyntax = (absPath) => {
  if (!typescript) {
    return {
      ok: false,
      message: 'TypeScript compiler not available under apps/server/node_modules/typescript'
    };
  }

  const source = fs.readFileSync(absPath, 'utf-8');
  const transpiled = typescript.transpileModule(source, {
    fileName: absPath,
    reportDiagnostics: true,
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext
    }
  });

  const errors = (transpiled.diagnostics || []).filter(
    (diag) => diag.category === typescript.DiagnosticCategory.Error
  );

  if (!errors.length) {
    return { ok: true, message: 'TS syntax OK' };
  }

  const first = errors[0];
  const msg = typescript.flattenDiagnosticMessageText(first.messageText, '\n');
  const location = first.file && typeof first.start === 'number'
    ? first.file.getLineAndCharacterOfPosition(first.start)
    : null;
  const line = location ? `${location.line + 1}:${location.character + 1}` : '';
  return {
    ok: false,
    message: line ? `${msg} (${line})` : msg
  };
};

const checkSyntax = (absPath, relPath) => {
  const ext = path.extname(relPath);
  if (ext === '.sh') {
    const res = runCmd('bash', ['-n', absPath]);
    return { ok: res.ok, message: res.ok ? 'bash -n OK' : (res.output || 'bash -n failed') };
  }
  if (ext === '.py') {
    const res = runCmd('python3', ['-m', 'py_compile', absPath]);
    return { ok: res.ok, message: res.ok ? 'py_compile OK' : (res.output || 'python compile failed') };
  }
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    const res = runCmd('node', ['--check', absPath]);
    return { ok: res.ok, message: res.ok ? 'node --check OK' : (res.output || 'node syntax check failed') };
  }
  if (ext === '.ts') {
    return checkTsSyntax(absPath);
  }
  if (ext === '.sql') {
    return { ok: true, message: 'SQL file exists (manual execution)' };
  }
  return { ok: true, message: 'No syntax checker for extension' };
};

const fail = (msg) => {
  console.error(`[SCRIPT-AUDIT][ERROR] ${msg}`);
  process.exit(1);
};

if (!fs.existsSync(manifestPath)) {
  fail(`Manifest not found: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
if (!Array.isArray(manifest) || manifest.length === 0) {
  fail('Manifest must be a non-empty array');
}

let okCount = 0;
let deprecatedCount = 0;
const failures = [];

console.log('[SCRIPT-AUDIT] verifying script status manifest...');
for (const item of manifest) {
  const relPath = item?.path;
  const status = item?.status;

  if (!relPath || typeof relPath !== 'string') {
    failures.push('Manifest entry has invalid path');
    continue;
  }
  if (!ALLOWED_STATUSES.has(status)) {
    failures.push(`${relPath}: invalid status "${status}"`);
    continue;
  }

  const absPath = path.join(rootDir, relPath);
  if (!fs.existsSync(absPath)) {
    failures.push(`${relPath}: file not found`);
    continue;
  }

  if (status === 'Deprecated') {
    deprecatedCount += 1;
    console.log(`DEPRECATED  ${relPath}`);
    continue;
  }

  const check = checkSyntax(absPath, relPath);
  if (!check.ok) {
    failures.push(`${relPath}: ${check.message}`);
    continue;
  }

  okCount += 1;
  console.log(`OK          ${relPath} (${check.message})`);
}

console.log(`[SCRIPT-AUDIT] summary: OK=${okCount} Deprecated=${deprecatedCount} Total=${manifest.length}`);

if (failures.length) {
  console.error('[SCRIPT-AUDIT] failures:');
  failures.forEach((entry) => console.error(` - ${entry}`));
  process.exit(1);
}

console.log('[SCRIPT-AUDIT] pass');
