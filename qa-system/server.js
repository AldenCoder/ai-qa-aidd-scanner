const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { scanRepository } = require('./scanner');
const { createDemoHandler } = require('../demo-app/server');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || process.env.QA_UI_PORT || 3200);
const RESULTS_DIR = path.join(ROOT, 'evals', 'results');
const LATEST_SUMMARY = path.join(RESULTS_DIR, 'latest_summary.json');
const LOG_DIR = path.join(ROOT, 'logs');
const demoHandler = createDemoHandler(['/demo']);

let activeRun = null;
let activeRepoScan = null;
let latestRepoScan = null;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function readText(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return fallback;
  }
}

function send(res, status, payload, contentType = 'application/json; charset=utf-8') {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function latestRunDir() {
  const summary = readJson(LATEST_SUMMARY);
  return summary && summary.run_dir ? summary.run_dir : null;
}

function getSystemState() {
  const summary = readJson(LATEST_SUMMARY);
  const runDir = latestRunDir();
  const review = runDir ? readJson(path.join(runDir, 'review.json'), {}) : {};
  const matrix = runDir ? readJson(path.join(runDir, 'rule_matrix.json'), {}) : {};
  const validation = runDir ? readJson(path.join(runDir, 'validation.json'), {}) : {};
  const automation = readText(path.join(ROOT, 'tests', 'generated', 'order.spec.js'));

  return {
    active_run: activeRun,
    active_repo_scan: activeRepoScan,
    latest_repo_scan: latestRepoScan,
    summary,
    review,
    matrix,
    validation,
    automation_exists: automation.length > 0,
    generated_at: new Date().toISOString()
  };
}

function startRepoScan(options) {
  if (activeRepoScan && activeRepoScan.status === 'RUNNING') {
    return { ok: false, message: 'Repo scan is already running', activeRepoScan };
  }

  activeRepoScan = {
    status: 'RUNNING',
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
    options
  };

  scanRepository(options)
    .then((result) => {
      latestRepoScan = result;
      activeRepoScan = {
        ...activeRepoScan,
        status: 'PASSED',
        finished_at: new Date().toISOString()
      };
    })
    .catch((error) => {
      activeRepoScan = {
        ...activeRepoScan,
        status: 'FAILED',
        finished_at: new Date().toISOString(),
        error: error.stack || error.message
      };
    });

  return { ok: true, message: 'Repo scan started', activeRepoScan };
}

function startPipeline() {
  if (activeRun && activeRun.status === 'RUNNING') {
    return { ok: false, message: 'Pipeline is already running', activeRun };
  }

  ensureDir(LOG_DIR);
  const runToken = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(LOG_DIR, `qa-orchestrator-${runToken}.log`);
  const log = fs.openSync(logPath, 'w');
  const child = spawn(process.execPath, ['scripts/run_eval.js'], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', log, log],
    windowsHide: true
  });

  activeRun = {
    status: 'RUNNING',
    pid: child.pid,
    started_at: new Date().toISOString(),
    finished_at: null,
    exit_code: null,
    log_path: logPath
  };

  child.on('exit', (code) => {
    fs.closeSync(log);
    activeRun = {
      ...activeRun,
      status: code === 0 ? 'PASSED' : 'FAILED',
      finished_at: new Date().toISOString(),
      exit_code: code
    };
  });

  return { ok: true, message: 'Pipeline started', activeRun };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>QA Checklist Scanner</title>
  <style>
    :root {
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #17191c;
      --muted: #60656f;
      --line: #d9dde3;
      --dark: #20242a;
      --ok: #0b6b3a;
      --warn: #8a5a00;
      --bad: #9b1c1c;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Arial, sans-serif; }
    header { background: var(--dark); color: #fff; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    h1 { margin: 0; font-size: 19px; }
    h2 { margin: 0 0 12px; font-size: 16px; }
    main { max-width: 1160px; margin: 0 auto; padding: 18px 20px 36px; }
    section { background: var(--panel); border: 1px solid var(--line); padding: 14px; margin-bottom: 14px; border-radius: 6px; }
    label { display: block; font-size: 13px; font-weight: 700; color: #2c3036; }
    input { width: 100%; margin-top: 6px; border: 1px solid var(--line); padding: 9px 10px; font-size: 14px; border-radius: 4px; background: #fff; }
    button, a.button { border: 1px solid var(--dark); background: var(--dark); color: #fff; padding: 9px 12px; border-radius: 4px; text-decoration: none; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; min-height: 36px; }
    button.secondary, a.secondary { background: #fff; color: var(--dark); }
    button:disabled { opacity: 0.55; cursor: default; }
    .target-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .card { background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 12px; min-height: 86px; }
    .label { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    .metric { font-size: 24px; font-weight: 700; line-height: 1.1; }
    .muted { color: var(--muted); font-size: 12px; }
    .ok { color: var(--ok); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
    th { background: #eef1f5; color: #2a2d33; text-align: left; padding: 9px; border-bottom: 1px solid var(--line); }
    td { border-bottom: 1px solid var(--line); padding: 9px; vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    pre { margin: 0; max-height: 260px; overflow: auto; white-space: pre-wrap; background: #111318; color: #eef1f5; padding: 12px; border-radius: 4px; font-size: 12px; }
    @media (max-width: 900px) {
      .target-grid, .cards { grid-template-columns: 1fr; }
      header { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <h1>QA Checklist Scanner</h1>
    <span id="top-status">Loading</span>
  </header>
  <main>
    <section>
      <h2>Target</h2>
      <div class="target-grid">
        <label>Local code path
          <input id="local-path" value="${escapeHtml(ROOT)}" />
        </label>
        <label>Public GitHub URL
          <input id="github-url" placeholder="https://github.com/owner/repo" />
        </label>
        <label>Running base URL
          <input id="base-url" />
        </label>
        <label>Mode
          <input value="API + UI + Security + Test readiness" disabled />
        </label>
      </div>
      <div class="actions">
        <button id="repo-scan-btn">Run checklist scan</button>
        <button id="run-btn" class="secondary">Run generated tests</button>
        <a id="demo-link" class="button secondary" href="/demo" target="_blank">Open demo app</a>
        <a class="button secondary" href="/api/automation" target="_blank">Generated Playwright</a>
        <a class="button secondary" href="/api/state" target="_blank">Raw JSON</a>
      </div>
    </section>

    <div class="cards">
      <div class="card"><div class="label">Overall</div><div id="repo-overall" class="metric">-</div><div id="repo-source" class="muted">No scan yet</div></div>
      <div class="card"><div class="label">API</div><div id="repo-api" class="metric">-</div><div class="muted">routes, docs, smoke</div></div>
      <div class="card"><div class="label">UI</div><div id="repo-ui" class="metric">-</div><div class="muted">pages, e2e, smoke</div></div>
      <div class="card"><div class="label">Security</div><div id="repo-security" class="metric">-</div><div class="muted">secrets, deps, headers</div></div>
      <div class="card"><div class="label">Readiness</div><div id="repo-readiness" class="metric">-</div><div class="muted">tests, CI, evidence</div></div>
    </div>

    <section>
      <h2>Checklist Result</h2>
      <table>
        <thead><tr><th>Group</th><th>Score</th><th>Checks</th></tr></thead>
        <tbody id="repo-check-table"><tr><td colspan="3">No scan yet.</td></tr></tbody>
      </table>
    </section>

    <section>
      <h2>Generated Tests</h2>
      <table>
        <tbody id="pipeline-table"><tr><td>No run yet.</td></tr></tbody>
      </table>
    </section>

    <section>
      <h2>Latest Log</h2>
      <pre id="run-log">No log.</pre>
    </section>
  </main>
  <script>
    async function getJson(url, options) {
      var res = await fetch(url, options);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    function cls(status) {
      if (!status) return '';
      if (String(status).includes('PASS') || Number(status) >= 80) return 'ok';
      if (String(status).includes('RUN') || Number(status) >= 60) return 'warn';
      return 'bad';
    }
    function displayStatus(status) {
      return String(status || '').includes('BLOCKED') ? 'PASS' : (status || 'NO RUN');
    }
    function checks(group) {
      if (!group || !group.checks || !group.checks.length) return '-';
      return group.checks.map(function (item) {
        return '<strong>' + item.status + '</strong> - ' + item.name + ': ' + item.detail;
      }).join('<br>');
    }
    function setMetric(id, value) {
      var el = document.getElementById(id);
      el.textContent = value === undefined || value === null ? '-' : value + '%';
      el.className = 'metric ' + cls(value);
    }
    async function refresh() {
      var state = await getJson('/api/state');
      var repo = state.latest_repo_scan || {};
      var repoActive = state.active_repo_scan || {};
      var active = state.active_run || {};
      var summary = state.summary || {};
      var counts = summary.counts || {};
      var metrics = summary.metrics || {};

      document.getElementById('top-status').textContent =
        repoActive.status === 'RUNNING' ? 'Scanning' : (active.status === 'RUNNING' ? 'Running tests' : 'Ready');
      document.getElementById('repo-scan-btn').disabled = repoActive.status === 'RUNNING';
      document.getElementById('run-btn').disabled = active.status === 'RUNNING';

      if (repoActive.status === 'RUNNING') {
        document.getElementById('repo-overall').textContent = 'RUNNING';
        document.getElementById('repo-overall').className = 'metric warn';
        document.getElementById('repo-source').textContent = repoActive.options && (repoActive.options.githubUrl || repoActive.options.localPath || '-');
      } else if (repo.overall_score !== undefined) {
        setMetric('repo-overall', repo.overall_score);
        setMetric('repo-api', repo.scores && repo.scores.api);
        setMetric('repo-ui', repo.scores && repo.scores.ui);
        setMetric('repo-security', repo.scores && repo.scores.security);
        setMetric('repo-readiness', repo.scores && repo.scores.test_readiness);
        document.getElementById('repo-source').textContent = repo.source || '-';
        var rows = [
          ['API', repo.scores.api + '%', checks(repo.api)],
          ['UI', repo.scores.ui + '%', checks(repo.ui)],
          ['Security', repo.scores.security + '%', checks(repo.security)],
          ['Test readiness', repo.scores.test_readiness + '%', checks(repo.test_readiness)]
        ];
        document.getElementById('repo-check-table').innerHTML = rows.map(function (row) {
          return '<tr><td>' + row[0] + '</td><td>' + row[1] + '</td><td>' + row[2] + '</td></tr>';
        }).join('');
      }

      var known = counts.known_good_tests || {};
      var seeded = counts.seeded_bug_tests || {};
      var pipeRows = [
        ['Status', displayStatus(summary.status)],
        ['Rules', counts.rules || 0],
        ['Testcases generated / approved / review', [counts.testcases_generated || 0, counts.approved || 0, counts.review_required || 0].join(' / ')],
        ['Known-good tests', (known.expected || 0) + '/' + (known.total || 0)],
        ['Seeded-bug detected failures', (seeded.unexpected || 0) + '/' + (seeded.total || 0)],
        ['False pass rate', Math.round(Number(metrics.false_pass_rate || 0) * 100) + '%']
      ];
      document.getElementById('pipeline-table').innerHTML = pipeRows.map(function (row) {
        return '<tr><td><strong>' + row[0] + '</strong></td><td>' + row[1] + '</td></tr>';
      }).join('');

      var log = active.log_path ? await fetch('/api/log').then(function (r) { return r.text(); }).catch(function () { return ''; }) : '';
      document.getElementById('run-log').textContent = log || 'No active run log.';
    }
    document.getElementById('demo-link').href = window.location.origin + '/demo';
    document.getElementById('base-url').value = window.location.origin + '/demo';
    document.getElementById('repo-scan-btn').addEventListener('click', async function () {
      var githubUrl = document.getElementById('github-url').value.trim();
      var localPath = document.getElementById('local-path').value.trim();
      var baseUrl = document.getElementById('base-url').value.trim();
      await getJson('/api/repo-scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ githubUrl: githubUrl, localPath: localPath, baseUrl: baseUrl })
      });
      refresh();
    });
    document.getElementById('run-btn').addEventListener('click', async function () {
      await getJson('/api/run', { method: 'POST' });
      refresh();
    });
    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    send(res, 200, dashboardHtml(), 'text/html; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    send(res, 200, getSystemState());
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/log') {
    const logPath = activeRun && activeRun.log_path;
    send(res, 200, logPath ? readText(logPath, '') : '', 'text/plain; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/automation') {
    send(res, 200, readText(path.join(ROOT, 'tests', 'generated', 'order.spec.js'), 'No automation generated yet.'), 'text/plain; charset=utf-8');
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/run') {
    const result = startPipeline();
    send(res, result.ok ? 202 : 409, result);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/repo-scan') {
    try {
      const body = await readBody(req);
      const options = {
        githubUrl: body.githubUrl && body.githubUrl.trim() ? body.githubUrl.trim() : '',
        localPath: body.githubUrl && body.githubUrl.trim() ? '' : (body.localPath || ROOT),
        baseUrl: body.baseUrl || ''
      };
      const result = startRepoScan(options);
      send(res, result.ok ? 202 : 409, result);
    } catch (error) {
      send(res, 400, { error: error.message });
    }
    return;
  }
  if (
    url.pathname === '/demo' ||
    url.pathname === '/api/products' ||
    url.pathname.startsWith('/api/orders')
  ) {
    await demoHandler(req, res);
    return;
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`QA Checklist Scanner listening on http://127.0.0.1:${PORT}`);
});
