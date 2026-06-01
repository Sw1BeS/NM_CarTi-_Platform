#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const srvRoot = path.dirname(root);
const outCodeMap = path.join(root, 'docs/code-map');
const outKnowledge = path.join(root, 'docs/project-knowledge');
const generatedAt = new Date().toISOString();
const checkMode = process.argv.includes('--check');

const requiredOutputs = [
  'docs/code-map/README.md',
  'docs/code-map/DIRECTORY_MAP.md',
  'docs/code-map/RUNTIME_INFRA_MAP.md',
  'docs/code-map/SERVER_CODE_MAP.md',
  'docs/code-map/WEB_CODE_MAP.md',
  'docs/code-map/DATA_MODEL_MAP.md',
  'docs/code-map/TELEGRAM_MINIAPP_MAP.md',
  'docs/code-map/INTEGRATIONS_MAP.md',
  'docs/code-map/RISK_REGISTER.md',
  'docs/code-map/RESOURCE_ORGANIZATION.md',
  'docs/code-map/MAP_DATA.json',
  'docs/project-knowledge/README.md',
  'docs/project-knowledge/AI_WORKFLOW.md',
  'docs/project-knowledge/PRODUCT_KNOWLEDGE.md',
  'docs/project-knowledge/OPERATIONS_KNOWLEDGE.md',
  'docs/project-knowledge/DOCUMENTATION_DIGEST.md',
  'docs/project-knowledge/OPEN_QUESTIONS.md',
];

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function abs(relPath) {
  return path.join(root, relPath);
}

function readText(relPath) {
  try {
    return fs.readFileSync(abs(relPath), 'utf8');
  } catch {
    return '';
  }
}

function readJson(relPath) {
  const text = readText(relPath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeExec(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || root,
      timeout: options.timeout || 20000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const stderr = error.stderr?.toString?.().trim();
    const stdout = error.stdout?.toString?.().trim();
    return stderr || stdout || null;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeOutput(relPath, content) {
  const target = abs(relPath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function formatTable(headers, rows) {
  if (!rows.length) return '_No entries found._\n';
  const escapeCell = (value) => String(value ?? '').replace(/\n/g, '<br>').replace(/\|/g, '\\|');
  const header = `| ${headers.map(escapeCell).join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${headers.map((headerName) => escapeCell(row[headerName])).join(' | ')} |`);
  return [header, divider, ...body].join('\n') + '\n';
}

function listEntries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function duHuman(target) {
  const output = safeExec('du', ['-sh', target], { cwd: srvRoot, timeout: 60000 });
  return output ? output.split(/\s+/)[0] : 'n/a';
}

function statSafe(target) {
  try {
    return fs.statSync(target);
  } catch {
    return null;
  }
}

function walkFiles(startDir, options = {}) {
  const skipNames = new Set(options.skipNames || []);
  const skipPrefixes = options.skipPrefixes || [];
  const maxFiles = options.maxFiles || 50000;
  const results = [];

  function shouldSkip(filePath, dirent) {
    const relative = rel(filePath);
    const top = relative.split('/')[0] || relative;
    if (skipNames.has(dirent.name)) return true;
    if (top.startsWith('_codex_release_backup')) return true;
    return skipPrefixes.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`));
  }

  function visit(dir) {
    if (results.length >= maxFiles) return;
    for (const entry of listEntries(dir)) {
      const target = path.join(dir, entry.name);
      if (shouldSkip(target, entry)) continue;
      if (entry.isDirectory()) {
        visit(target);
      } else if (entry.isFile()) {
        const stat = statSafe(target);
        if (stat) {
          results.push({
            path: rel(target),
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          });
        }
      }
    }
  }

  visit(startDir);
  return results;
}

function classifyCartieTop(name) {
  if (name === 'apps') return ['active_source', 'Core server and web apps.'];
  if (name === 'infra') return ['active_infra', 'Dockerfiles, compose, Caddy/nginx-adjacent runtime config.'];
  if (name === 'scripts') return ['ops_tooling', 'Operational scripts, smoke checks, deploy helpers, inspection generators.'];
  if (name === 'docs') return ['documentation_mixed', 'Current docs plus older audit/release notes; now has generated map and project knowledge.'];
  if (name === 'README.md') return ['current_doc', 'Primary project overview; keep near root.'];
  if (name === '.agent') return ['agent_tooling', 'Local agent rules, workflows, and operational memory.'];
  if (name === '.github') return ['ci_metadata', 'Repository automation metadata.'];
  if (name === '.git') return ['git_metadata', 'Repository metadata; never clean manually.'];
  if (name === '.gitignore' || name === '.dockerignore') return ['project_metadata', 'Project ignore metadata; keep.'];
  if (name === 'data') return ['runtime_data_do_not_delete', 'Postgres and imported/runtime data volumes.'];
  if (name === 'storage') return ['runtime_media_do_not_delete', 'Uploaded/imported media and Telegram media storage.'];
  if (name === '_logs') return ['runtime_logs', 'Application and deployment logs; rotate, do not use as source.'];
  if (name === '.deploy') return ['deployment_state', 'Deployment artifacts, rollback evidence, and env-key manifests; protected by default.'];
  if (name === 'deploy_output.log') return ['runtime_logs', 'Deployment log; rotate or archive with release evidence.'];
  if (name === 'env') return ['secret_bearing_dir', 'Environment config directory; path-only inventory, no value inspection.'];
  if (name === 'node_modules' || name.endsWith('node_modules')) return ['generated_dependencies', 'Reinstallable dependencies.'];
  if (name === '_archive' || name.startsWith('_codex_release_backup')) return ['historical_archive', 'Historical snapshots; keep out of active architecture graph.'];
  if (name === '.env' || name.endsWith('.env')) return ['secret_bearing', 'Secret-bearing config; inventory path only, never content.'];
  if (name.endsWith('.env.example') || name === '.env.example') return ['env_template', 'Public environment template; keep scrubbed and versionable.'];
  if (/\.pdf$/i.test(name)) return ['product_doc_artifact', 'Product/business documentation artifact.'];
  if (/^stage2-/i.test(name)) return ['historical_doc', 'Stage 2 planning/release note; review before trusting as current.'];
  if (/^(RELEASE|SMOKE|TEST|PATCH|FIX|SUMMARY|DEPLOYMENT|MODULE_MAP|ARCHITECTURE)/i.test(name)) return ['operational_doc_review', 'Operational or architecture note; reconcile with generated map before using.'];
  if (name.startsWith('FINAL_') || name.includes('AUDIT') || name.includes('REPORT')) return ['historical_doc', 'Top-level historical report; review before trusting as current.'];
  return ['misc_review', 'Needs owner/classification if it grows or becomes active.'];
}

function classifySrvTop(name) {
  if (name === 'cartie') return ['active_product_workspace', 'Primary workspace for the Cartie product.'];
  if (name === 'backups') return ['backup_retention', 'Large backup area; prune only with explicit retention policy.'];
  if (name === 'cleanup-artifacts') return ['cleanup_evidence', 'Cleanup archives, manifests, and transfer evidence.'];
  if (name === 'audit-artifacts') return ['audit_evidence', 'Server and project audit outputs.'];
  if (name === '_quarantine') return ['quarantine', 'Temporary holding area; should usually stay empty after archive/export/delete.'];
  return ['srv_misc_review', 'Non-Cartie server resource; classify before changing.'];
}

function packageSummary(relPath) {
  const pkg = readJson(relPath);
  if (!pkg) {
    return { path: relPath, present: false, scripts: [], dependencies: [], devDependencies: [] };
  }
  return {
    path: relPath,
    name: pkg.name || '(unnamed)',
    version: pkg.version || '(none)',
    private: Boolean(pkg.private),
    type: pkg.type || '(default)',
    scripts: Object.keys(pkg.scripts || {}),
    dependencies: Object.keys(pkg.dependencies || {}),
    devDependencies: Object.keys(pkg.devDependencies || {}),
  };
}

function extractServerIndex() {
  const source = readText('apps/server/src/index.ts');
  const mounts = [];
  for (const match of source.matchAll(/app\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z0-9_$]+)/g)) {
    mounts.push({ path: match[1], handler: match[2] });
  }
  const directRoutes = [];
  for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)) {
    directRoutes.push({ method: match[1].toUpperCase(), path: match[2] });
  }
  const startupServices = [
    'Prisma connection',
    'event handlers',
    'admin seed',
    'platform bootstrap',
    'Telegram bot manager',
    'content worker',
    'scheduler',
    'MTProto worker',
    'MTProto lifecycle restore',
  ].filter((label) => {
    const token = label.toLowerCase().split(' ')[0];
    return source.toLowerCase().includes(token);
  });
  return { mounts, directRoutes, startupServices };
}

function extractRouteFiles() {
  const routeRoots = [
    'apps/server/src/routes',
    'apps/server/src/modules/Communication/telegram',
  ];
  const files = [];
  for (const routeRoot of routeRoots) {
    const full = abs(routeRoot);
    if (!fs.existsSync(full)) continue;
    for (const file of walkFiles(full, {
      skipNames: new Set(['node_modules', 'dist']),
      maxFiles: 5000,
    }).filter((entry) => /\.(ts|tsx)$/.test(entry.path))) {
      const text = readText(file.path);
      const routeMatches = [...text.matchAll(/(?:router|app)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g)]
        .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
      const exported = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/g)]
        .map((match) => match[1])
        .slice(0, 8);
      files.push({
        path: file.path,
        size: file.size,
        routeCount: routeMatches.length,
        routes: routeMatches.slice(0, 20),
        exports: exported,
      });
    }
  }
  return files.sort((a, b) => b.routeCount - a.routeCount || b.size - a.size);
}

function extractWebRoutes() {
  const source = readText('apps/web/src/App.tsx');
  const routes = [];
  for (const match of source.matchAll(/<Route\s+path=["']([^"']+)["'][^>]*>/g)) {
    const routeText = match[0];
    const element = routeText.match(/element=\{<([A-Za-z0-9_]+)/)?.[1] || routeText.match(/element=\{([^}]+)\}/)?.[1] || '';
    routes.push({ path: match[1], element });
  }
  return routes;
}

function extractPrisma() {
  const schema = readText('apps/server/prisma/schema.prisma');
  const models = [...schema.matchAll(/^model\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]);
  const enums = [...schema.matchAll(/^enum\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]);
  const datasource = schema.match(/datasource\s+([A-Za-z0-9_]+)\s+\{([\s\S]*?)\n\}/)?.[1] || 'unknown';
  const generator = schema.match(/generator\s+([A-Za-z0-9_]+)\s+\{([\s\S]*?)\n\}/)?.[1] || 'unknown';
  return { datasource, generator, models, enums };
}

function groupPrismaModels(models) {
  const groups = [
    ['Workspaces/Auth', /Workspace|GlobalUser|Membership|User|Role|Invite|Session|Auth/],
    ['CRM/Requests', /Lead|Request|Variant|Contact|Case|Conversation|Message|Pipeline/],
    ['Inventory/Vehicles', /Car|Vehicle|Listing|Inventory|External|Source|Dealer|Company/],
    ['Telegram/MiniApp', /Telegram|MiniApp|Bot|Channel|Showcase|MTProto|Destination/],
    ['Content/Automation', /Scenario|Campaign|Template|Parser|RawDocument|PlatformEvent|SystemSettings/],
  ];
  return groups.map(([name, regex]) => ({
    name,
    models: models.filter((model) => regex.test(model)),
  })).concat([{
    name: 'Other',
    models: models.filter((model) => !groups.some(([, regex]) => regex.test(model))),
  }]);
}

function extractDocsCorpus(files) {
  const docs = files
    .filter((file) => /\.md$/i.test(file.path))
    .filter((file) => !file.path.startsWith('docs/code-map/') && !file.path.startsWith('docs/project-knowledge/'));
  return docs.map((file) => {
    const text = readText(file.path);
    const firstHeading = text.match(/^#\s+(.+)$/m)?.[1] || path.basename(file.path);
    let classification = 'current_or_unknown';
    if (file.path === 'README.md' || file.path === 'docs/README.md' || file.path.includes('deploy_runbook')) {
      classification = 'current_operational';
    } else if (file.path.startsWith('.agent/')) {
      classification = 'agent_tooling_reference';
    } else if (file.path.startsWith('docs/superpowers/')) {
      classification = 'recent_planning_trace';
    } else if (file.path.startsWith('docs/audit/') || file.path.startsWith('docs/stage2/') || file.path.includes('release-')) {
      classification = 'historical_audit_or_release';
    } else if (file.path.startsWith('_archive/') || file.path.startsWith('_codex_release_backup')) {
      classification = 'archived_historical';
    } else if (/FINAL|AUDIT|REPORT|IMPLEMENTATION|DEEP/i.test(file.path)) {
      classification = 'top_level_historical_report';
    }
    return {
      path: file.path,
      title: firstHeading,
      classification,
      size: file.size,
      mtime: file.mtime,
    };
  }).sort((a, b) => {
    const priority = {
      current_operational: 0,
      recent_planning_trace: 1,
      top_level_historical_report: 2,
      historical_audit_or_release: 3,
      current_or_unknown: 4,
      agent_tooling_reference: 5,
      archived_historical: 6,
    };
    return (priority[a.classification] ?? 9) - (priority[b.classification] ?? 9) || a.path.localeCompare(b.path);
  });
}

function findLargestSource(files) {
  return files
    .filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.path))
    .filter((file) => file.path.startsWith('apps/') || file.path.startsWith('scripts/'))
    .sort((a, b) => b.size - a.size)
    .slice(0, 20);
}

function findSecretBearingPaths() {
  const secretName = /(^\.env($|\.)|prod\.env$|env_keys\.txt$|\.pem$|\.key$|secret)/i;
  const templateName = /(\.example$|\.sample$|example\.env$|\.env\.example$)/i;
  return walkFiles(root, {
    skipNames: new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']),
    skipPrefixes: ['data', 'storage'],
    maxFiles: 80000,
  })
    .filter((file) => {
      const base = path.basename(file.path);
      return secretName.test(base) && !templateName.test(base);
    })
    .map((file) => file.path)
    .sort();
}

function countByTop(files) {
  const counts = new Map();
  for (const file of files) {
    const top = file.path.split('/')[0] || file.path;
    counts.set(top, (counts.get(top) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([pathName, count]) => ({ path: pathName, files: count }))
    .sort((a, b) => b.files - a.files);
}

function currentRuntime() {
  const composePs = safeExec('docker', ['compose', '-f', 'infra/docker-compose.cartie2.prod.yml', 'ps'], { timeout: 30000 });
  const failedUnits = safeExec('systemctl', ['--failed', '--no-pager'], { cwd: srvRoot, timeout: 15000 });
  const nginxSites = listEntries('/etc/nginx/sites-enabled').map((entry) => {
    const linkPath = path.join('/etc/nginx/sites-enabled', entry.name);
    let target = '';
    try {
      target = fs.readlinkSync(linkPath);
    } catch {
      target = entry.isDirectory() ? '(directory)' : '(file)';
    }
    return { name: entry.name, target };
  });
  return { composePs, failedUnits, nginxSites };
}

function findIntegrationEvidence(files) {
  const paths = files.map((file) => file.path);
  const salesDriveFiles = paths.filter((filePath) => /apps\/server\/src\/modules\/Integrations\/salesdrive/i.test(filePath));
  const metaFiles = paths.filter((filePath) => /apps\/server\/src\/modules\/Integrations\/meta/i.test(filePath));
  return {
    salesDriveMeta: {
      present: salesDriveFiles.length > 0 || metaFiles.length > 0,
      evidence: [...salesDriveFiles.slice(0, 2), ...metaFiles.slice(0, 2)],
    },
  };
}

function buildInventory() {
  const sourceSkip = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.turbo']);
  const activeFiles = walkFiles(root, {
    skipNames: sourceSkip,
    skipPrefixes: ['data', 'storage', '_logs', '.deploy', '_archive'],
    maxFiles: 60000,
  });
  const cartieTop = listEntries(root).map((entry) => {
    const [classification, note] = classifyCartieTop(entry.name);
    const target = path.join(root, entry.name);
    const stat = statSafe(target);
    return {
      path: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
      size: duHuman(target),
      classification,
      note,
      mtime: stat?.mtime?.toISOString?.() || '',
    };
  });
  const srvTop = listEntries(srvRoot).map((entry) => {
    const [classification, note] = classifySrvTop(entry.name);
    const target = path.join(srvRoot, entry.name);
    return {
      path: `/srv/${entry.name}`,
      type: entry.isDirectory() ? 'dir' : 'file',
      size: duHuman(target),
      classification,
      note,
    };
  });

  const packages = [
    packageSummary('package.json'),
    packageSummary('apps/server/package.json'),
    packageSummary('apps/web/package.json'),
  ].filter((pkg) => pkg.present !== false);

  const gitStatus = safeExec('git', ['status', '--short', '--branch']);
  const gitHead = safeExec('git', ['rev-parse', '--short', 'HEAD']);
  const serverIndex = extractServerIndex();
  const routeFiles = extractRouteFiles();
  const webRoutes = extractWebRoutes();
  const prisma = extractPrisma();
  const docsCorpus = extractDocsCorpus(activeFiles);
  const largeSourceFiles = findLargestSource(activeFiles);
  const runtime = currentRuntime();
  const secretBearingPaths = findSecretBearingPaths();
  const integrationEvidence = findIntegrationEvidence(activeFiles);

  return {
    generatedAt,
    root,
    srvRoot,
    git: { head: gitHead, status: gitStatus },
    counts: {
      activeFiles: activeFiles.length,
      docs: docsCorpus.length,
      serverRouteFiles: routeFiles.length,
      webRoutes: webRoutes.length,
      prismaModels: prisma.models.length,
      prismaEnums: prisma.enums.length,
    },
    cartieTop,
    srvTop,
    fileCountsByTop: countByTop(activeFiles),
    packages,
    serverIndex,
    routeFiles,
    webRoutes,
    prisma,
    prismaGroups: groupPrismaModels(prisma.models),
    docsCorpus,
    largeSourceFiles,
    secretBearingPaths,
    integrationEvidence,
    runtime,
    knownOperationalFindings: [
      {
        item: 'Post-cleanup Cartie health',
        status: 'passed in manual assessment',
        evidence: '/srv/cleanup-artifacts/cartie-first-20260526/post-cleanup-cartie-assessment-latest/CARTIE_POST_CLEANUP_DAMAGE_ASSESSMENT.md',
      },
      {
        item: 'Web TypeScript check',
        status: 'known failing with existing tracked type errors',
        evidence: 'See post-cleanup assessment before treating tsc failures as cleanup damage.',
      },
      {
        item: 'MiniApp Telegram menu hash',
        status: 'availability ok, config drift noted',
        evidence: 'Live Telegram menu hash and DB expected hash differed during manual assessment; both URLs returned 200.',
      },
      {
        item: 'Documentation drift',
        status: 'confirmed by read-only code exploration',
        evidence: '`docs/ARCHITECTURE.md` still describes a much smaller route surface than the current runtime; `docs/CANONICAL_DOCS_INDEX.md` promotes older Feb audit docs as source of truth.',
      },
    ],
  };
}

function mdHeader(title, inventory) {
  return `# ${title}\n\nGenerated: ${inventory.generatedAt}\nRoot: \`${inventory.root}\`\nGit: \`${inventory.git.head || 'unknown'}\`\n\n`;
}

function renderReadme(inventory) {
  return mdHeader('Cartie Code Map', inventory) + [
    'This directory is the current machine-generated map of the Cartie workspace.',
    'It is intentionally factual and path-oriented: use it to decide what is active, what is runtime state, and what should stay out of cleanup scope.',
    '',
    '## Start here',
    '',
    '- `DIRECTORY_MAP.md` - `/srv` and `/srv/cartie` resource classification.',
    '- `SERVER_CODE_MAP.md` - Express entrypoint, mounted routers, and high-risk route files.',
    '- `WEB_CODE_MAP.md` - Vite/React public and protected route surface.',
    '- `DATA_MODEL_MAP.md` - Prisma model and enum inventory.',
    '- `TELEGRAM_MINIAPP_MAP.md` - Telegram, MiniApp, and public request flow notes.',
    '- `RUNTIME_INFRA_MAP.md` - Docker Compose, ports, nginx sites, and smoke-check commands.',
    '- `RESOURCE_ORGANIZATION.md` - what to keep, rotate, archive, or review.',
    '- `RISK_REGISTER.md` - current structural risks and verification gates.',
    '- `MAP_DATA.json` - raw machine-readable inventory used by these docs.',
    '',
    'Do not edit generated files by hand. Update `scripts/inspect/generate_code_map.mjs` and regenerate.',
  ].join('\n');
}

function renderDirectoryMap(inventory) {
  const cartieRows = inventory.cartieTop.map((entry) => ({
    Path: `\`${entry.path}\``,
    Type: entry.type,
    Size: entry.size,
    Class: entry.classification,
    'Action note': entry.note,
  }));
  const srvRows = inventory.srvTop.map((entry) => ({
    Path: `\`${entry.path}\``,
    Type: entry.type,
    Size: entry.size,
    Class: entry.classification,
    'Action note': entry.note,
  }));
  const countsRows = inventory.fileCountsByTop.slice(0, 20).map((entry) => ({
    Top: `\`${entry.path}\``,
    Files: entry.files,
  }));
  return mdHeader('Directory Map', inventory) +
    '## `/srv` resources\n\n' + formatTable(['Path', 'Type', 'Size', 'Class', 'Action note'], srvRows) +
    '\n## `/srv/cartie` top-level resources\n\n' + formatTable(['Path', 'Type', 'Size', 'Class', 'Action note'], cartieRows) +
    '\n## Active inventory file counts\n\n' + formatTable(['Top', 'Files'], countsRows) +
    '\nRuntime folders (`data`, `storage`, `_logs`, `.deploy`) are classified, but excluded from the active code graph.\n';
}

function renderRuntimeInfra(inventory) {
  const packageRows = inventory.packages.map((pkg) => ({
    Package: `\`${pkg.path}\``,
    Name: pkg.name,
    Type: pkg.type,
    Scripts: pkg.scripts.join(', '),
    Dependencies: pkg.dependencies.length,
    DevDeps: pkg.devDependencies.length,
  }));
  const siteRows = inventory.runtime.nginxSites.map((site) => ({
    Site: `\`${site.name}\``,
    Target: `\`${site.target}\``,
  }));
  return mdHeader('Runtime Infra Map', inventory) +
    '## Runtime shape\n\n' +
    '- Compose file: `infra/docker-compose.cartie2.prod.yml`\n' +
    '- Database: Postgres 15 on `127.0.0.1:5433 -> 5432`, volume `/srv/cartie/data/cartie2/postgres`.\n' +
    '- API: Node/Express on `127.0.0.1:3002 -> 3001`, media mounted from `/srv/cartie/storage`.\n' +
    '- Web: Caddy/Vite static frontend on `127.0.0.1:8082 -> 8080`.\n' +
    '- Public reverse proxy: nginx sites in `/etc/nginx/sites-enabled`.\n\n' +
    '## Package scripts\n\n' + formatTable(['Package', 'Name', 'Type', 'Scripts', 'Dependencies', 'DevDeps'], packageRows) +
    '\n## nginx enabled sites\n\n' + formatTable(['Site', 'Target'], siteRows) +
    '\n## Current compose ps snapshot\n\n```text\n' + (inventory.runtime.composePs || 'not available') + '\n```\n\n' +
    '## Systemd failed units snapshot\n\n```text\n' + (inventory.runtime.failedUnits || 'not available') + '\n```\n\n' +
    '## Safe smoke checks\n\n' +
    '```bash\n' +
    'docker compose -f /srv/cartie/infra/docker-compose.cartie2.prod.yml ps\n' +
    'curl -fsS http://127.0.0.1:3002/health\n' +
    'curl -fsS http://127.0.0.1:8082/\n' +
    'nginx -t\n' +
    'systemctl --failed --no-pager\n' +
    '```\n';
}

function renderServerMap(inventory) {
  const mountRows = inventory.serverIndex.mounts.map((mount) => ({
    Mount: `\`${mount.path}\``,
    Handler: `\`${mount.handler}\``,
  }));
  const directRows = inventory.serverIndex.directRoutes.map((route) => ({
    Method: route.method,
    Path: `\`${route.path}\``,
  }));
  const routeRows = inventory.routeFiles.slice(0, 30).map((file) => ({
    File: `\`${file.path}\``,
    Bytes: file.size,
    Routes: file.routeCount,
    'First routes': file.routes.slice(0, 6).map((route) => `\`${route}\``).join('<br>'),
  }));
  return mdHeader('Server Code Map', inventory) +
    '## Entrypoint\n\n' +
    '`apps/server/src/index.ts` wires middleware, public webhooks, API routers, health endpoints, static media, frontend static serving, and startup workers.\n\n' +
    '## Mounted routers\n\n' + formatTable(['Mount', 'Handler'], mountRows) +
    '\n## Direct app routes\n\n' + formatTable(['Method', 'Path'], directRows) +
    '\n## Route-heavy files\n\n' + formatTable(['File', 'Bytes', 'Routes', 'First routes'], routeRows) +
    '\n## Startup responsibilities\n\n' +
    inventory.serverIndex.startupServices.map((item) => `- ${item}`).join('\n') + '\n';
}

function renderWebMap(inventory) {
  const rows = inventory.webRoutes.map((route) => ({
    Route: `\`${route.path}\``,
    Element: route.element ? `\`${route.element}\`` : '',
    Surface: route.path.startsWith('/p/') || route.path === '/login' ? 'public' : 'protected/app',
  }));
  return mdHeader('Web Code Map', inventory) +
    '`apps/web/src/App.tsx` defines the visible React Router surface. Public MiniApp and request/proposal routes live beside protected operational screens.\n\n' +
    formatTable(['Route', 'Element', 'Surface'], rows) +
    '\nPrimary UI risk areas are large page-level components; see `RISK_REGISTER.md` before refactoring `MiniApp.tsx`, `Inbox.tsx`, or `Inventory.tsx`.\n';
}

function renderDataModelMap(inventory) {
  const groupRows = inventory.prismaGroups.map((group) => ({
    Domain: group.name,
    Count: group.models.length,
    Models: group.models.map((model) => `\`${model}\``).join(', '),
  }));
  const enumRows = inventory.prisma.enums.map((name) => ({ Enum: `\`${name}\`` }));
  return mdHeader('Data Model Map', inventory) +
    `Datasource: \`${inventory.prisma.datasource}\`\nGenerator: \`${inventory.prisma.generator}\`\n\n` +
    `Models: ${inventory.prisma.models.length}. Enums: ${inventory.prisma.enums.length}.\n\n` +
    '## Model groups\n\n' + formatTable(['Domain', 'Count', 'Models'], groupRows) +
    '\n## Enums\n\n' + formatTable(['Enum'], enumRows);
}

function renderTelegramMiniAppMap(inventory) {
  const relevantFiles = inventory.largeSourceFiles
    .filter((file) => /MiniApp|telegram|Telegram|miniApp|routeCallback|routeMessage/.test(file.path))
    .slice(0, 12)
    .map((file) => ({
      File: `\`${file.path}\``,
      Bytes: file.size,
    }));
  return mdHeader('Telegram and MiniApp Map', inventory) +
    '## Current flow\n\n' +
    '1. Telegram updates enter through `/api/telegram` and module routing under `apps/server/src/modules/Communication/telegram`.\n' +
    '2. Bot/menu logic points users into public MiniApp URLs under `/p/app` and `/p/app/:slug`.\n' +
    '3. MiniApp/API flows continue through `/api/miniapp`, `/api/public`, inventory, request, partner, and template routes.\n' +
    '4. Public frontend screens live in `apps/web/src/pages/public`, with `MiniApp.tsx` as the largest current UI surface.\n\n' +
    '## High-attention files\n\n' + formatTable(['File', 'Bytes'], relevantFiles) +
    '\n## Operational note\n\n' +
    'The latest manual post-cleanup check found MiniApp availability intact but noted Telegram menu hash drift between live config and DB-expected config. Treat this as configuration drift, not confirmed downtime.\n\n' +
    '## Scenario Ownership Note\n\n' +
    'Template presets seed admin-visible scenarios and commands for `CLIENT_LEAD`\n' +
    'and `B2B`, but the critical buyer, seller, support, B2B request, and MiniApp\n' +
    'handoff flows are mostly owned by specialized Telegram/MiniApp handlers. Treat\n' +
    'scenario graph edits as admin/template behavior unless a route explicitly\n' +
    'delegates to the scenario engine.\n\n' +
    'Persistent reply-keyboard `web_app` buttons for `CLIENT_LEAD` should point to\n' +
    'canonical `/p/app/{slug}` URLs. Do not reintroduce section query params into\n' +
    'reply-keyboard URLs without rechecking Telegram signed launch behavior.\n';
}

function renderIntegrationsMap(inventory) {
  const deps = new Set(inventory.packages.flatMap((pkg) => pkg.dependencies));
  const salesDriveMeta = inventory.integrationEvidence?.salesDriveMeta || { present: false, evidence: [] };
  const salesDriveMetaNote = salesDriveMeta.present
    ? `Detected by module paths: ${salesDriveMeta.evidence.map((item) => `\`${item}\``).join(', ')}.`
    : 'Not detected in active integration module paths; product roadmap may still reference future work.';
  const rows = [
    ['Postgres/Prisma', deps.has('@prisma/client'), 'Primary persistence layer via `apps/server/prisma/schema.prisma`.'],
    ['Telegram Bot API', deps.has('telegram') || inventory.serverIndex.mounts.some((m) => m.path.includes('telegram')), 'Telegram bot, routing, sources, MTProto connector, MiniApp entrypoints.'],
    ['MTProto', inventory.prisma.models.some((model) => model.includes('MTProto')), 'Telegram account/source lifecycle and workers.'],
    ['WhatsApp webhook', inventory.serverIndex.mounts.some((m) => m.path.includes('whatsapp')), 'Mounted at `/api/webhooks/whatsapp`.'],
    ['Viber webhook', inventory.serverIndex.mounts.some((m) => m.path.includes('viber')), 'Mounted at `/api/webhooks/viber`.'],
    ['SalesDrive/Meta', salesDriveMeta.present, salesDriveMetaNote],
    ['Caddy/nginx', true, 'Caddy serves web container; nginx is public reverse proxy.'],
  ].map(([Name, Present, Notes]) => ({ Name, Present: Present ? 'yes' : 'not detected', Notes }));
  return mdHeader('Integrations Map', inventory) + formatTable(['Name', 'Present', 'Notes'], rows);
}

function renderRiskRegister(inventory) {
  const largeRows = inventory.largeSourceFiles.slice(0, 12).map((file) => ({
    File: `\`${file.path}\``,
    Bytes: file.size,
  }));
  const risks = [
    ['R1', 'Runtime state is inside repo path', 'high', '`data`, `storage`, `_logs`, and `.deploy` must stay excluded from cleanup/refactor operations unless explicitly targeted with backups.'],
    ['R2', 'Large frontend/public MiniApp component', 'high', '`apps/web/src/pages/public/MiniApp.tsx` is large enough that UI changes need focused regression tests and visual smoke checks.'],
    ['R3', 'Telegram router concentration', 'high', '`routeMessage.ts`, `routeCallback.ts`, and MiniApp route files centralize a lot of behavior; split only with tests around command/callback flows.'],
    ['R4', 'Web TypeScript check has existing failures', 'medium', 'Do not treat `apps/web` `tsc --noEmit` failures as new damage without comparing to the post-cleanup assessment.'],
    ['R5', 'MiniApp menu config drift', 'medium', 'Manual assessment found live and DB MiniApp hashes differed while both URLs were reachable. Needs a deliberate config reconciliation task.'],
    ['R6', 'Large backup/artifact footprint under `/srv`', 'medium', '`/srv/backups` and cleanup artifacts are useful evidence but need a retention policy before future pruning.'],
    ['R7', 'Secret-bearing local config', 'high', `${inventory.secretBearingPaths.length ? inventory.secretBearingPaths.map((item) => `\`${item}\``).join(', ') : 'No common secret files detected by path scan.'} Never print or copy values into generated docs.`],
  ].map(([ID, Risk, Severity, Notes]) => ({ ID, Risk, Severity, Notes }));
  return mdHeader('Risk Register', inventory) +
    formatTable(['ID', 'Risk', 'Severity', 'Notes'], risks) +
    '\n## Largest active source files\n\n' + formatTable(['File', 'Bytes'], largeRows);
}

function renderResourceOrganization(inventory) {
  const rows = inventory.cartieTop.map((entry) => {
    let decision = 'review';
    if (['active_source', 'active_infra', 'ops_tooling', 'agent_tooling', 'ci_metadata', 'project_metadata', 'git_metadata', 'current_doc', 'env_template', 'product_doc_artifact'].includes(entry.classification)) decision = 'keep';
    if (['runtime_data_do_not_delete', 'runtime_media_do_not_delete'].includes(entry.classification)) decision = 'preserve_with_backups';
    if (entry.classification === 'runtime_logs') decision = 'rotate';
    if (entry.classification === 'generated_dependencies') decision = 'reinstallable';
    if (entry.classification === 'historical_archive' || entry.classification === 'historical_doc') decision = 'archive_or_move_after_review';
    if (entry.classification === 'operational_doc_review' || entry.classification === 'documentation_mixed') decision = 'reconcile_then_keep_or_archive';
    if (entry.classification === 'secret_bearing' || entry.classification === 'secret_bearing_dir') decision = 'preserve_private';
    if (entry.classification === 'deployment_state') decision = 'preserve_until_owner_retention_policy';
    return {
      Path: `\`${entry.path}\``,
      Class: entry.classification,
      Decision: decision,
      Note: entry.note,
    };
  });
  return mdHeader('Resource Organization', inventory) +
    '## Decisions\n\n' + formatTable(['Path', 'Class', 'Decision', 'Note'], rows) +
    '\n## Cleanup rule\n\n' +
    'Protected by default: active source, runtime data/media/logs, deployment state, secret-bearing paths, git metadata, and rollback/evidence directories.\n\n' +
    'Only delete after all four are true: classification is not protected, an archive exists outside the working path, a restore path is known, and Cartie smoke checks still pass after removal.\n';
}

function renderKnowledgeReadme(inventory) {
  return mdHeader('Cartie Project Knowledge Base', inventory) +
    'This directory is the current operator-facing knowledge base for Cartie.\n\n' +
    '- `AI_WORKFLOW.md` - how to brief AI agents and constrain future implementation work.\n' +
    '- `PRODUCT_KNOWLEDGE.md` - product surfaces and domain model in plain language.\n' +
    '- `OPERATIONS_KNOWLEDGE.md` - how the service runs and what to check before/after changes.\n' +
    '- `DOCUMENTATION_DIGEST.md` - which existing docs are current, historical, or planning traces.\n' +
    '- `OPEN_QUESTIONS.md` - unresolved items worth turning into tasks.\n\n' +
    'The source of truth is the live workspace plus generated `../code-map/MAP_DATA.json`; old reports are context, not authority.\n';
}

function renderAiWorkflow(inventory) {
  return mdHeader('AI Workflow', inventory) +
    'Use this file as the handoff prompt skeleton for future AI-assisted work on Cartie.\n\n' +
    '## Minimum context pack\n\n' +
    'Give the agent these files first:\n\n' +
    '- `docs/project-knowledge/README.md`\n' +
    '- `docs/project-knowledge/AI_WORKFLOW.md`\n' +
    '- `docs/project-knowledge/OPERATIONS_KNOWLEDGE.md`\n' +
    '- `docs/code-map/MAP_DATA.json`\n' +
    '- The most relevant `docs/code-map/*.md` file for the subsystem being changed.\n\n' +
    'For Meta, SalesDrive, Telegram, and MiniApp work, include `docs/code-map/INTEGRATIONS_MAP.md` and `docs/code-map/TELEGRAM_MINIAPP_MAP.md`.\n\n' +
    '## Prompt template\n\n' +
    '```text\n' +
    'Read /srv/cartie/docs/project-knowledge/README.md, /srv/cartie/docs/project-knowledge/AI_WORKFLOW.md, and /srv/cartie/docs/code-map/MAP_DATA.json.\n' +
    'Treat /srv/cartie/data, /srv/cartie/storage, /srv/cartie/_logs, /srv/cartie/.deploy, /srv/cartie/env, .env files, and secret-bearing paths as protected.\n' +
    'Do not inspect secret values. Inventory secret-bearing paths by filename only.\n' +
    'Implement only: <task>.\n' +
    'Before edits, identify owner files, compatibility boundaries, and exact verification commands.\n' +
    'Prefer focused tests before code changes. After edits, run targeted tests, server typecheck if server code changed, generated docs check if docs/code-map changed, and live smoke only when deployment/runtime was touched.\n' +
    'Report what was verified, what was not verified, and any residual risk.\n' +
    '```\n\n' +
    '## Working rules\n\n' +
    '- Generated code-map files are current workspace truth; older audit reports are evidence, not authority.\n' +
    '- Runtime data, media, logs, deployment artifacts, and env material are not cleanup targets unless a retention policy and restore path are explicit.\n' +
    '- For live Cartie changes, keep the change recoverable: record git status, run tests before deploy, deploy the narrowest affected service, then smoke `/health` and the affected route.\n' +
    '- For Meta/SalesDrive work, separate telemetry/debug logs from real outbound sends. Internal actions such as `miniapp.tracking_bound` must not be counted as Meta CAPI sends.\n\n' +
    '## Standard verification menu\n\n' +
    '```bash\n' +
    'npm --prefix apps/server test -- <focused test files>\n' +
    'npx tsc --noEmit --pretty false\n' +
    'node scripts/inspect/generate_code_map.mjs && node scripts/inspect/generate_code_map.mjs --check\n' +
    'docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml ps\n' +
    'curl -fsS http://127.0.0.1:3002/health\n' +
    '```\n';
}

function renderProductKnowledge(inventory) {
  return mdHeader('Product Knowledge', inventory) +
    '## Product take\n\n' +
    'Cartie is a B2B automotive operations product with a Telegram/MiniApp front door, inventory/listing management, leads and requests, partner/dealer flows, and admin/superadmin operations.\n\n' +
    '## Main surfaces\n\n' +
    '- Public buyer/request surfaces: `/p/request`, `/p/app`, `/p/app/:slug`, `/p/dealer`, `/p/proposal/:id`.\n' +
    '- Internal app surfaces: inbox, requests, Telegram, leads, search, inventory, companies, entities, settings, content, calendar, partners, integrations, QA, health, superadmin.\n' +
    '- Server surfaces: `/api/telegram`, `/api/miniapp`, `/api/public`, `/api/inventory`, `/api/requests`, `/api/companies`, `/api/integrations`, `/api/b2b`, `/api/superadmin`, `/api/v2`.\n\n' +
    '## Domain backbone\n\n' +
    inventory.prismaGroups.map((group) => `- ${group.name}: ${group.models.slice(0, 12).join(', ') || 'none detected'}`).join('\n') +
    '\n\n## Current strategic artifacts\n\n' +
    inventory.cartieTop
      .filter((entry) => entry.classification === 'product_doc_artifact')
      .map((entry) => `- \`${entry.path}\` is present as a product/business artifact. Decide whether it belongs in versioned docs or external product storage.`)
      .join('\n') + '\n';
}

function renderOperationsKnowledge(inventory) {
  const protectedPaths = [
    '/srv/cartie/data',
    '/srv/cartie/storage',
    '/srv/cartie/_logs',
    '/srv/cartie/.deploy',
    '/srv/cartie/env',
    '/srv/cartie/.env',
    '/srv/cartie/apps/server/.env',
    '/srv/cartie/apps/web/.env.production',
    '/srv/cartie/infra/.env',
  ];
  return mdHeader('Operations Knowledge', inventory) +
    '## Before any cleanup or refactor\n\n' +
    `- Treat these paths as protected by default: ${protectedPaths.map((item) => `\`${item}\``).join(', ')}.\n` +
    '- Do not move or delete deployment state, rollback evidence, logs, or env directories without an owner-approved retention policy and verified restore path.\n' +
    '- Confirm `git status --short --branch` and note untracked product artifacts before editing.\n' +
    '- Archive before deleting historical or backup material.\n\n' +
    '## Standard smoke gate\n\n' +
    '```bash\n' +
    'docker compose -f /srv/cartie/infra/docker-compose.cartie2.prod.yml ps\n' +
    'curl -fsS http://127.0.0.1:3002/health\n' +
    'curl -fsS http://127.0.0.1:8082/\n' +
    'nginx -t\n' +
    'systemctl --failed --no-pager\n' +
    '```\n\n' +
    '## Deployment shape\n\n' +
    '- API build: `infra/Dockerfile.api`, exposed locally on `127.0.0.1:3002`.\n' +
    '- Web build: `infra/Dockerfile.web`, exposed locally on `127.0.0.1:8082`.\n' +
    '- Database: compose-managed Postgres volume under `/srv/cartie/data/cartie2/postgres`.\n' +
    '- Public routing: nginx sites for `cartie.umanoff-analytics.space`, `cartie2.umanoff-analytics.space`, `api.umanoff-analytics.space`, and related hostnames.\n\n' +
    '## Known verification caveat\n\n' +
    'The server TypeScript check passed in the latest manual assessment. The web TypeScript check had existing tracked failures, so use route-level/browser smoke checks until a dedicated type cleanup is done.\n';
}

function renderDocumentationDigest(inventory) {
  const rows = inventory.docsCorpus.slice(0, 120).map((doc) => ({
    Path: `\`${doc.path}\``,
    Class: doc.classification,
    Title: doc.title,
    Updated: doc.mtime.slice(0, 10),
  }));
  return mdHeader('Documentation Digest', inventory) +
    '## Reading order\n\n' +
    '1. Generated `docs/code-map/*` and `docs/project-knowledge/*` for current workspace truth.\n' +
    '2. `README.md`, `docs/README.md`, and deploy runbooks for maintained instructions.\n' +
    '3. `docs/superpowers/plans/*` for recent planning trace.\n' +
    '4. `docs/audit/*`, top-level `FINAL_*`, and stage/release notes only as historical evidence.\n\n' +
    '## Known drift\n\n' +
    '- `docs/CANONICAL_DOCS_INDEX.md` still points at older Feb release audit material as source of truth; use generated docs plus runtime checks first.\n' +
    '- `docs/ARCHITECTURE.md` describes a small route count that no longer matches the current Express router surface.\n' +
    '- Older MiniApp docs mention `web_app_data`-style assumptions while current runtime is REST/initData-first.\n\n' +
    '## Existing docs corpus\n\n' + formatTable(['Path', 'Class', 'Title', 'Updated'], rows);
}

function renderOpenQuestions(inventory) {
  const productArtifacts = inventory.cartieTop
    .filter((entry) => entry.classification === 'product_doc_artifact')
    .map((entry) => `\`${entry.path}\``)
    .join(', ');
  const questions = [
    ['Q1', productArtifacts ? `Should ${productArtifacts} be versioned, moved into docs, or stored externally?` : 'Where should product/business artifacts live if they are not versioned under `/srv/cartie`?', 'product_docs'],
    ['Q2', 'What retention window should `/srv/backups` and `/srv/cleanup-artifacts` follow now that this server is Cartie-first?', 'ops_retention'],
    ['Q3', 'Should the MiniApp Telegram menu DB hash be reconciled to the live hash, or is the live config ahead of DB intentionally?', 'telegram_config'],
    ['Q4', 'When should the existing web TypeScript debt be cleaned up enough for `tsc --noEmit` to become a hard gate?', 'quality_gate'],
    ['Q5', 'Which historical docs should be promoted into the knowledge base versus archived permanently?', 'docs_governance'],
    ['Q6', 'Should `docs/CANONICAL_DOCS_INDEX.md` and `docs/ARCHITECTURE.md` be replaced with pointers to the generated code map?', 'docs_drift'],
  ].map(([ID, Question, Area]) => ({ ID, Area, Question }));
  return mdHeader('Open Questions', inventory) + formatTable(['ID', 'Area', 'Question'], questions);
}

function withFinalNewline(content) {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function renderOutputs(inventory) {
  return {
    'docs/code-map/README.md': renderReadme(inventory),
    'docs/code-map/DIRECTORY_MAP.md': renderDirectoryMap(inventory),
    'docs/code-map/RUNTIME_INFRA_MAP.md': renderRuntimeInfra(inventory),
    'docs/code-map/SERVER_CODE_MAP.md': renderServerMap(inventory),
    'docs/code-map/WEB_CODE_MAP.md': renderWebMap(inventory),
    'docs/code-map/DATA_MODEL_MAP.md': renderDataModelMap(inventory),
    'docs/code-map/TELEGRAM_MINIAPP_MAP.md': renderTelegramMiniAppMap(inventory),
    'docs/code-map/INTEGRATIONS_MAP.md': renderIntegrationsMap(inventory),
    'docs/code-map/RISK_REGISTER.md': renderRiskRegister(inventory),
    'docs/code-map/RESOURCE_ORGANIZATION.md': renderResourceOrganization(inventory),
    'docs/code-map/MAP_DATA.json': JSON.stringify(inventory, null, 2),
    'docs/project-knowledge/README.md': renderKnowledgeReadme(inventory),
    'docs/project-knowledge/AI_WORKFLOW.md': renderAiWorkflow(inventory),
    'docs/project-knowledge/PRODUCT_KNOWLEDGE.md': renderProductKnowledge(inventory),
    'docs/project-knowledge/OPERATIONS_KNOWLEDGE.md': renderOperationsKnowledge(inventory),
    'docs/project-knowledge/DOCUMENTATION_DIGEST.md': renderDocumentationDigest(inventory),
    'docs/project-knowledge/OPEN_QUESTIONS.md': renderOpenQuestions(inventory),
  };
}

function runCheck() {
  const missing = requiredOutputs.filter((relPath) => !fs.existsSync(abs(relPath)));
  if (missing.length) {
    console.error(`Missing generated outputs:\n${missing.map((item) => `- ${item}`).join('\n')}`);
    process.exit(1);
  }
  const data = JSON.parse(readText('docs/code-map/MAP_DATA.json'));
  const expectedOutputs = renderOutputs(data);
  const requiredCounts = ['activeFiles', 'docs', 'webRoutes', 'prismaModels'];
  for (const countKey of requiredCounts) {
    if (!Number.isFinite(data.counts?.[countKey]) || data.counts[countKey] <= 0) {
      console.error(`Invalid or empty MAP_DATA counts.${countKey}`);
      process.exit(1);
    }
  }
  const staleOutputs = requiredOutputs.filter((relPath) => readText(relPath) !== withFinalNewline(expectedOutputs[relPath]));
  if (staleOutputs.length) {
    console.error(`Generated outputs are stale or inconsistent with MAP_DATA.json:\n${staleOutputs.map((item) => `- ${item}`).join('\n')}`);
    process.exit(1);
  }
  const generatedText = requiredOutputs
    .filter((relPath) => relPath.endsWith('.md'))
    .map((relPath) => readText(relPath))
    .join('\n');
  const leakedEnvAssignment = /(?:TOKEN|SECRET|PASSWORD|DATABASE_URL|API_KEY)\s*=\s*["']?[^"'\s`]+/i.test(generatedText);
  if (leakedEnvAssignment) {
    console.error('Generated Markdown appears to contain a secret-like assignment.');
    process.exit(1);
  }
  console.log(`Generated knowledge base check passed: ${requiredOutputs.length} files.`);
}

function main() {
  if (checkMode) {
    runCheck();
    return;
  }

  ensureDir(outCodeMap);
  ensureDir(outKnowledge);
  const inventory = buildInventory();
  for (const [relPath, content] of Object.entries(renderOutputs(inventory))) {
    writeOutput(relPath, content);
  }

  console.log(`Generated ${requiredOutputs.length} Cartie code-map/project-knowledge files.`);
}

main();
