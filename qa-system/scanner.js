const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  'evidence',
  'logs'
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeRead(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return '';
  }
}

function walk(root, limit = 12000) {
  const files = [];
  function visit(dir) {
    if (files.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  visit(root);
  return files;
}

function rel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function parsePackageJson(root) {
  const file = path.join(root, 'package.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return null;
  }
}

function addCheck(checks, name, status, detail, weight = 1) {
  checks.push({ name, status, detail, weight });
}

function scoreChecks(checks) {
  let max = 0;
  let earned = 0;
  for (const check of checks) {
    if (check.status === 'INFO') continue;
    max += check.weight;
    if (check.status === 'PASS') earned += check.weight;
    if (check.status === 'WARN') earned += check.weight * 0.5;
  }
  return max === 0 ? 0 : Math.round((earned / max) * 100);
}

function detectStack(root, files, pkg) {
  const deps = {
    ...(pkg && pkg.dependencies ? pkg.dependencies : {}),
    ...(pkg && pkg.devDependencies ? pkg.devDependencies : {})
  };
  const stack = [];
  for (const key of ['react', 'vue', '@angular/core', 'next', 'vite', 'express', 'fastify', '@nestjs/core', '@playwright/test', 'cypress']) {
    if (deps[key]) stack.push(key);
  }
  if (files.some((file) => file.endsWith('.py') && safeRead(file).includes('FastAPI'))) stack.push('fastapi');
  if (files.some((file) => file.endsWith('.csproj'))) stack.push('.net');
  if (files.some((file) => file.endsWith('.html'))) stack.push('html');
  return [...new Set(stack)];
}

function discoverApi(root, files) {
  const endpoints = [];
  const apiFiles = files.filter((file) => /\.(js|ts|py|cs)$/.test(file));
  for (const file of apiFiles) {
    const content = safeRead(file);
    const lines = content.split(/\r?\n/);
    let match;
    const expressRe = /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    while ((match = expressRe.exec(content))) {
      endpoints.push({ method: match[1].toUpperCase(), path: match[2], file: rel(root, file) });
    }
    const fastApiRe = /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    while ((match = fastApiRe.exec(content))) {
      endpoints.push({ method: match[1].toUpperCase(), path: match[2], file: rel(root, file) });
    }
    const dotnetRe = /\[Http(Get|Post|Put|Patch|Delete)(?:\("([^"]*)"\))?\]/gi;
    while ((match = dotnetRe.exec(content))) {
      endpoints.push({ method: match[1].toUpperCase(), path: match[2] || '(controller route)', file: rel(root, file) });
    }
    lines.forEach((line, index) => {
      const pathMatch = line.match(/url\.pathname\s*===\s*['"`]([^'"`]+)['"`]/);
      if (pathMatch) {
        const context = lines.slice(Math.max(0, index - 3), index + 2).join(' ');
        const methodMatch = context.match(/req\.method\s*===\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
        endpoints.push({
          method: methodMatch ? methodMatch[1].toUpperCase() : 'UNKNOWN',
          path: pathMatch[1],
          file: rel(root, file)
        });
      }
      const regexMatch = line.match(/url\.pathname\.match\(\s*\/\^\\\/([^/\\]+)/);
      if (regexMatch) {
        const context = lines.slice(Math.max(0, index - 3), index + 2).join(' ');
        const methodMatch = context.match(/req\.method\s*===\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
        endpoints.push({
          method: methodMatch ? methodMatch[1].toUpperCase() : 'UNKNOWN',
          path: `/${regexMatch[1]}/{id}`,
          file: rel(root, file)
        });
      }
    });
  }
  const key = (endpoint) => `${endpoint.method} ${endpoint.path} ${endpoint.file}`;
  return [...new Map(endpoints.map((endpoint) => [key(endpoint), endpoint])).values()];
}

async function smokeGet(baseUrl, endpoints) {
  if (!baseUrl) return [];
  const candidates = endpoints
    .filter((endpoint) => endpoint.method === 'GET')
    .filter((endpoint) => !endpoint.path.includes('{') && !endpoint.path.includes(':') && endpoint.path !== '/')
    .slice(0, 5);
  const results = [];
  for (const endpoint of candidates) {
    const url = new URL(endpoint.path, baseUrl).toString();
    try {
      const started = Date.now();
      const response = await fetch(url, { method: 'GET' });
      results.push({ endpoint, url, status: response.status, ok: response.status < 500, duration_ms: Date.now() - started });
    } catch (error) {
      results.push({ endpoint, url, status: null, ok: false, error: error.message });
    }
  }
  return results;
}

async function scanApi(root, files, baseUrl) {
  const checks = [];
  const endpoints = discoverApi(root, files);
  const openapi = files.filter((file) => /(?:openapi|swagger).*\.(ya?ml|json)$/i.test(path.basename(file)));
  const apiTests = files.filter((file) => {
    const name = rel(root, file).toLowerCase();
    if (!/(test|spec|__tests__)/.test(name)) return false;
    const content = safeRead(file);
    return /supertest|request\.|api\/|fetch\(|axios/.test(content);
  });
  const smoke = await smokeGet(baseUrl, endpoints);

  addCheck(checks, 'Discover API endpoints', endpoints.length > 0 ? 'PASS' : 'FAIL', `${endpoints.length} endpoint(s) found`, 3);
  addCheck(checks, 'OpenAPI/Swagger spec', openapi.length > 0 ? 'PASS' : 'WARN', openapi.length ? openapi.map((f) => rel(root, f)).join(', ') : 'Not found', 2);
  addCheck(checks, 'API tests present', apiTests.length > 0 ? 'PASS' : 'WARN', `${apiTests.length} API test file(s)`, 2);
  if (baseUrl) {
    addCheck(checks, 'GET smoke test', smoke.length && smoke.every((r) => r.ok) ? 'PASS' : 'WARN', `${smoke.filter((r) => r.ok).length}/${smoke.length} GET smoke checks passed`, 2);
  } else {
    addCheck(checks, 'GET smoke test', 'INFO', 'Skipped because baseURL was not provided');
  }

  return { score: scoreChecks(checks), checks, endpoints, smoke };
}

async function scanUi(root, files, pkg, baseUrl) {
  const checks = [];
  const deps = {
    ...(pkg && pkg.dependencies ? pkg.dependencies : {}),
    ...(pkg && pkg.devDependencies ? pkg.devDependencies : {})
  };
  const hasUi = files.some((file) => /\.(html|jsx|tsx|vue|svelte)$/.test(file)) || ['react', 'vue', '@angular/core', 'next', 'vite'].some((d) => deps[d]);
  const e2e = files.filter((file) => /(?:playwright|cypress)\.config\.(js|ts|mjs|cjs)$/.test(path.basename(file)));
  const uiTests = files.filter((file) => {
    const name = rel(root, file).toLowerCase();
    if (!/(test|spec|e2e|cypress|playwright)/.test(name)) return false;
    const content = safeRead(file);
    return /page\.|cy\.|getByRole|getByLabel|toBeVisible|toContainText/.test(content);
  });
  let homeSmoke = null;
  if (baseUrl) {
    try {
      const response = await fetch(baseUrl);
      const body = await response.text();
      homeSmoke = { status: response.status, ok: response.status < 500, hasHtml: /<html|<form|<div/i.test(body) };
    } catch (error) {
      homeSmoke = { ok: false, error: error.message };
    }
  }

  addCheck(checks, 'UI surface detected', hasUi ? 'PASS' : 'WARN', hasUi ? 'UI files/framework detected' : 'No obvious UI files found', 2);
  addCheck(checks, 'E2E framework configured', e2e.length > 0 ? 'PASS' : 'WARN', e2e.length ? e2e.map((f) => rel(root, f)).join(', ') : 'Playwright/Cypress config not found', 2);
  addCheck(checks, 'UI/E2E tests present', uiTests.length > 0 ? 'PASS' : 'WARN', `${uiTests.length} UI/E2E test file(s)`, 2);
  if (baseUrl) {
    addCheck(checks, 'Homepage smoke', homeSmoke && homeSmoke.ok ? 'PASS' : 'WARN', homeSmoke ? JSON.stringify(homeSmoke) : 'Not run', 1);
  } else {
    addCheck(checks, 'Homepage smoke', 'INFO', 'Skipped because baseURL was not provided');
  }

  return { score: scoreChecks(checks), checks, ui_tests: uiTests.map((file) => rel(root, file)), home_smoke: homeSmoke };
}

function runNpmAudit(root) {
  if (!fs.existsSync(path.join(root, 'package-lock.json'))) {
    return { status: 'INFO', detail: 'No package-lock.json; npm audit skipped' };
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['audit', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true
  });
  const stdout = result.stdout || '{}';
  try {
    const parsed = JSON.parse(stdout);
    const vulnerabilities = parsed.metadata && parsed.metadata.vulnerabilities ? parsed.metadata.vulnerabilities : {};
    const total = vulnerabilities.total || 0;
    return {
      status: total === 0 ? 'PASS' : 'WARN',
      detail: `${total} npm vulnerabilities`,
      vulnerabilities
    };
  } catch (error) {
    return { status: 'WARN', detail: `npm audit parse failed: ${error.message}` };
  }
}

function scanSecurity(root, files, pkg) {
  const checks = [];
  const secretFindings = [];
  const envFiles = [];
  const patterns = [
    { name: 'AWS key', re: /AKIA[0-9A-Z]{16}/ },
    { name: 'Private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
    { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
    { name: 'Generic secret assignment', re: /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i }
  ];
  for (const file of files) {
    const relative = rel(root, file);
    if (/\.env(?:\.|$)/.test(path.basename(file))) envFiles.push(relative);
    if (!/\.(js|ts|py|json|yml|yaml|env|txt|md|sh|ps1|cs)$/.test(file)) continue;
    const content = safeRead(file);
    patterns.forEach((pattern) => {
      if (pattern.re.test(content)) {
        secretFindings.push({ file: relative, type: pattern.name });
      }
    });
  }
  const audit = runNpmAudit(root);
  const deps = {
    ...(pkg && pkg.dependencies ? pkg.dependencies : {}),
    ...(pkg && pkg.devDependencies ? pkg.devDependencies : {})
  };
  const securityDeps = ['helmet', 'cors', 'express-rate-limit', '@fastify/helmet'].filter((dep) => deps[dep]);

  addCheck(checks, 'Secret scan', secretFindings.length === 0 ? 'PASS' : 'FAIL', `${secretFindings.length} possible secret finding(s)`, 3);
  addCheck(checks, '.env committed', envFiles.length === 0 ? 'PASS' : 'WARN', envFiles.length ? envFiles.join(', ') : 'No .env files found', 1);
  addCheck(checks, 'Dependency audit', audit.status, audit.detail, 2);
  addCheck(checks, 'Security middleware hints', securityDeps.length > 0 ? 'PASS' : 'WARN', securityDeps.length ? securityDeps.join(', ') : 'No common Node security middleware detected', 1);

  return { score: scoreChecks(checks), checks, secret_findings: secretFindings.slice(0, 50), env_files: envFiles, audit };
}

function scanTestReadiness(root, files, pkg) {
  const checks = [];
  const scripts = pkg && pkg.scripts ? pkg.scripts : {};
  const ciFiles = files.filter((file) => /(?:^|\/)\.github\/workflows\/.+\.ya?ml$|gitlab-ci|azure-pipelines/i.test(rel(root, file)));
  const unitTests = files.filter((file) => /\.(test|spec)\.(js|ts|jsx|tsx|py|cs)$/.test(file));
  const docs = files.filter((file) => /readme|testing|qa|checklist/i.test(path.basename(file)));

  addCheck(checks, 'Test script', scripts.test ? 'PASS' : 'WARN', scripts.test || 'No package.json test script', 2);
  addCheck(checks, 'Lint script', scripts.lint ? 'PASS' : 'WARN', scripts.lint || 'No package.json lint script', 1);
  addCheck(checks, 'CI workflow', ciFiles.length > 0 ? 'PASS' : 'WARN', ciFiles.length ? ciFiles.map((f) => rel(root, f)).join(', ') : 'No CI workflow detected', 1);
  addCheck(checks, 'Test files', unitTests.length > 0 ? 'PASS' : 'WARN', `${unitTests.length} test/spec file(s)`, 2);
  addCheck(checks, 'QA documentation', docs.length > 0 ? 'PASS' : 'WARN', `${docs.length} QA/readme/checklist doc(s)`, 1);

  return { score: scoreChecks(checks), checks };
}

function validateGithubUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com' && parsed.pathname.split('/').filter(Boolean).length >= 2;
  } catch (error) {
    return false;
  }
}

function prepareTarget(options) {
  if (options.githubUrl) {
    if (!validateGithubUrl(options.githubUrl)) {
      throw new Error('Only public https://github.com/<owner>/<repo> URLs are supported.');
    }
    const scansDir = path.join(os.tmpdir(), 'ai-qa-poc-scans');
    ensureDir(scansDir);
    const id = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(scansDir, id);
    const result = spawnSync('git', ['clone', '--depth', '1', options.githubUrl, target], {
      encoding: 'utf8',
      timeout: 60000,
      windowsHide: true
    });
    if (result.status !== 0) {
      throw new Error(`git clone failed: ${result.stderr || result.stdout}`);
    }
    return { root: target, source: options.githubUrl, cloned: true };
  }
  const root = path.resolve(options.localPath || ROOT);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Local path not found: ${root}`);
  }
  return { root, source: root, cloned: false };
}

async function scanRepository(options = {}) {
  const started = Date.now();
  const target = prepareTarget(options);
  const files = walk(target.root);
  const pkg = parsePackageJson(target.root);
  const stack = detectStack(target.root, files, pkg);
  const baseUrl = options.baseUrl && options.baseUrl.trim() ? options.baseUrl.trim() : '';

  const api = await scanApi(target.root, files, baseUrl);
  const ui = await scanUi(target.root, files, pkg, baseUrl);
  const security = scanSecurity(target.root, files, pkg);
  const readiness = scanTestReadiness(target.root, files, pkg);
  const scores = {
    api: api.score,
    ui: ui.score,
    security: security.score,
    test_readiness: readiness.score
  };
  const overall = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.values(scores).length);

  return {
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    source: target.source,
    cloned: target.cloned,
    root: target.root,
    file_count: files.length,
    stack,
    base_url: baseUrl || null,
    overall_score: overall,
    scores,
    api,
    ui,
    security,
    test_readiness: readiness
  };
}

module.exports = {
  scanRepository,
  prepareTarget,
  walk,
  safeRead,
  rel,
  discoverApi,
  detectStack
};
