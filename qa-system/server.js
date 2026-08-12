const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { scanRepository } = require('./scanner');
const { generateTestcases, toCsv, OUTPUT_FILE } = require('./testcase-writer');
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
let activeWriterRun = null;
let latestWriterOutput = readJson(OUTPUT_FILE, null);

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
      if (data.length > 2 * 1024 * 1024) {
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

  return {
    active_writer_run: activeWriterRun,
    latest_writer_output: latestWriterOutput || readJson(OUTPUT_FILE, null),
    active_run: activeRun,
    active_repo_scan: activeRepoScan,
    latest_repo_scan: latestRepoScan,
    summary,
    review,
    matrix,
    validation,
    generated_at: new Date().toISOString()
  };
}

function startWriterRun(options) {
  if (activeWriterRun && activeWriterRun.status === 'RUNNING') {
    return { ok: false, message: 'Test case generation is already running', activeWriterRun };
  }

  activeWriterRun = {
    status: 'RUNNING',
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
    options
  };

  generateTestcases(options)
    .then((result) => {
      latestWriterOutput = result;
      activeWriterRun = {
        ...activeWriterRun,
        status: 'PASSED',
        finished_at: new Date().toISOString()
      };
    })
    .catch((error) => {
      activeWriterRun = {
        ...activeWriterRun,
        status: 'FAILED',
        finished_at: new Date().toISOString(),
        error: error.stack || error.message
      };
    });

  return { ok: true, message: 'Test case generation started', activeWriterRun };
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
  <title>AI QA Test Case Writer</title>
  <style>
    :root {
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #16181d;
      --muted: #5f6673;
      --line: #d9dee6;
      --dark: #20242b;
      --ok: #0b6b3a;
      --warn: #8a5a00;
      --bad: #9b1c1c;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Arial, sans-serif; }
    header { background: var(--dark); color: #fff; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    h1 { margin: 0; font-size: 19px; }
    h2 { margin: 0 0 12px; font-size: 16px; }
    main { max-width: 1220px; margin: 0 auto; padding: 18px 20px 36px; }
    section { background: var(--panel); border: 1px solid var(--line); padding: 14px; margin-bottom: 14px; border-radius: 6px; }
    label { display: block; font-size: 13px; font-weight: 700; color: #2d323a; }
    input, textarea { width: 100%; margin-top: 6px; border: 1px solid var(--line); padding: 9px 10px; font-size: 14px; border-radius: 4px; background: #fff; font-family: Arial, sans-serif; }
    textarea { min-height: 86px; resize: vertical; }
    button, a.button { border: 1px solid var(--dark); background: var(--dark); color: #fff; padding: 9px 12px; border-radius: 4px; text-decoration: none; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; min-height: 36px; }
    button.secondary, a.secondary { background: #fff; color: var(--dark); }
    button:disabled { opacity: 0.55; cursor: default; }
    .target-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .full { grid-column: 1 / -1; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .card { background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 12px; min-height: 84px; }
    .label { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
    .metric { font-size: 24px; font-weight: 700; line-height: 1.1; }
    .muted { color: var(--muted); font-size: 12px; }
    .ok { color: var(--ok); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
    th { background: #eef1f5; color: #2a2e35; text-align: left; padding: 9px; border-bottom: 1px solid var(--line); }
    td { border-bottom: 1px solid var(--line); padding: 9px; vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    .steps { margin: 0; padding-left: 18px; }
    pre { margin: 0; max-height: 220px; overflow: auto; white-space: pre-wrap; background: #111318; color: #eef1f5; padding: 12px; border-radius: 4px; font-size: 12px; }
    @media (max-width: 980px) {
      .target-grid, .cards { grid-template-columns: 1fr; }
      header { align-items: flex-start; flex-direction: column; }
      th:nth-child(4), td:nth-child(4) { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <h1>AI QA Test Case Writer</h1>
    <span id="top-status">Loading</span>
  </header>
  <main>
    <section>
      <h2>Source</h2>
      <div class="target-grid">
        <label>Local code or document path
          <input id="local-path" value="${escapeHtml(ROOT)}" />
        </label>
        <label>Public GitHub URL
          <input id="github-url" placeholder="https://github.com/owner/repo" />
        </label>
        <label class="full">Extra requirement notes
          <textarea id="requirements-text" placeholder="Paste BR/SRS/user story/checklist text here when the repo does not contain enough docs."></textarea>
        </label>
      </div>
      <div class="actions">
        <button id="generate-btn">Generate test cases</button>
        <button id="eval-btn" class="secondary">Run sample evaluation</button>
        <a id="demo-link" class="button secondary" href="/demo" target="_blank">Open sample app</a>
        <a class="button secondary" href="/api/testcases/export.json" target="_blank">Export JSON</a>
        <a class="button secondary" href="/api/testcases/export.csv" target="_blank">Export CSV</a>
      </div>
    </section>

    <div class="cards">
      <div class="card"><div class="label">Generated</div><div id="m-total" class="metric">-</div><div id="m-source" class="muted">No generation yet</div></div>
      <div class="card"><div class="label">Ready</div><div id="m-ready" class="metric">-</div><div class="muted">Can be used by tester</div></div>
      <div class="card"><div class="label">Need Review</div><div id="m-review" class="metric">-</div><div class="muted">BA/tester confirmation</div></div>
      <div class="card"><div class="label">Coverage</div><div id="m-coverage" class="metric">-</div><div class="muted">Functional/API/UI/security</div></div>
      <div class="card"><div class="label">Traceability</div><div id="m-trace" class="metric">-</div><div class="muted">Has linked source</div></div>
    </div>

    <section>
      <h2>Generated Test Cases</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Module</th>
            <th>Priority</th>
            <th>Type</th>
            <th>Test Case</th>
            <th>Steps / Expected</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="testcase-table"><tr><td colspan="7">No test cases yet.</td></tr></tbody>
      </table>
    </section>

    <section>
      <h2>Coverage Notes</h2>
      <table>
        <tbody id="coverage-table"><tr><td>No coverage data yet.</td></tr></tbody>
      </table>
    </section>

    <section>
      <h2>Sample Evaluation</h2>
      <table>
        <tbody id="eval-table"><tr><td>No sample run yet.</td></tr></tbody>
      </table>
      <pre id="run-log">No active run log.</pre>
    </section>
  </main>
  <script>
    async function getJson(url, options) {
      var res = await fetch(url, options);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    function esc(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function metricClass(value) {
      if (value === undefined || value === null || value === '-') return 'metric';
      var num = Number(value);
      if (Number.isNaN(num)) return 'metric warn';
      if (num >= 80) return 'metric ok';
      if (num >= 60) return 'metric warn';
      return 'metric bad';
    }
    function setMetric(id, value, suffix) {
      var el = document.getElementById(id);
      var display = value === undefined || value === null ? '-' : String(value) + (suffix || '');
      el.textContent = display;
      el.className = metricClass(value);
    }
    function stepsHtml(testcase) {
      var steps = (testcase.steps || []).map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('');
      return '<ol class="steps">' + steps + '</ol><div><strong>Expected:</strong> ' + esc(testcase.expected_result) + '</div>';
    }
    function sourceText(testcase) {
      return (testcase.sources || []).map(function (item) {
        return item.file + ' / ' + item.section;
      }).join('; ');
    }
    function renderTestcases(pack) {
      var list = pack && pack.testcases ? pack.testcases : [];
      if (!list.length) {
        document.getElementById('testcase-table').innerHTML = '<tr><td colspan="7">No test cases yet.</td></tr>';
        return;
      }
      document.getElementById('testcase-table').innerHTML = list.slice(0, 80).map(function (testcase) {
        var statusClass = testcase.review_status === 'READY' ? 'ok' : 'warn';
        return '<tr>' +
          '<td>' + esc(testcase.test_case_id) + '</td>' +
          '<td>' + esc(testcase.module) + '<div class="muted">' + esc(sourceText(testcase)) + '</div></td>' +
          '<td>' + esc(testcase.priority) + '</td>' +
          '<td>' + esc(testcase.type) + '</td>' +
          '<td><strong>' + esc(testcase.title) + '</strong><div class="muted">' + esc(testcase.automation_hint) + '</div></td>' +
          '<td>' + stepsHtml(testcase) + '</td>' +
          '<td class="' + statusClass + '">' + esc(testcase.review_status) + '<div class="muted">' + esc(testcase.review_notes) + '</div></td>' +
        '</tr>';
      }).join('');
    }
    function renderCoverage(pack) {
      if (!pack || !pack.metrics) {
        document.getElementById('coverage-table').innerHTML = '<tr><td>No coverage data yet.</td></tr>';
        return;
      }
      var metrics = pack.metrics;
      var gaps = pack.gaps || [];
      var rows = [
        ['Requirements found', metrics.requirements_found],
        ['API endpoints found', metrics.endpoints_found],
        ['UI surfaces found', metrics.ui_surfaces_found],
        ['Files scanned', pack.file_count],
        ['Stack hints', (pack.stack || []).join(', ') || '-'],
        ['Gaps', gaps.length ? gaps.join('<br>') : 'No major gap detected']
      ];
      document.getElementById('coverage-table').innerHTML = rows.map(function (row) {
        return '<tr><td><strong>' + esc(row[0]) + '</strong></td><td>' + row[1] + '</td></tr>';
      }).join('');
    }
    function renderEval(summary) {
      var counts = summary && summary.counts ? summary.counts : {};
      var metrics = summary && summary.metrics ? summary.metrics : {};
      var known = counts.known_good_tests || {};
      var seeded = counts.seeded_bug_tests || {};
      var rows = [
        ['Rules extracted', counts.rules || 0],
        ['Static sample testcases', counts.testcases_generated || 0],
        ['Approved / review required', (counts.approved || 0) + ' / ' + (counts.review_required || 0)],
        ['Known-good automation', (known.expected || 0) + '/' + (known.total || 0)],
        ['Seeded-bug failures detected', (seeded.unexpected || 0) + '/' + (seeded.total || 0)],
        ['False pass rate', Math.round(Number(metrics.false_pass_rate || 0) * 100) + '%']
      ];
      document.getElementById('eval-table').innerHTML = rows.map(function (row) {
        return '<tr><td><strong>' + esc(row[0]) + '</strong></td><td>' + esc(row[1]) + '</td></tr>';
      }).join('');
    }
    async function refresh() {
      var state = await getJson('/api/state');
      var writer = state.active_writer_run || {};
      var pack = state.latest_writer_output;
      var metrics = pack && pack.metrics ? pack.metrics : {};
      var active = state.active_run || {};

      document.getElementById('top-status').textContent =
        writer.status === 'RUNNING' ? 'Generating test cases' : (active.status === 'RUNNING' ? 'Running evaluation' : 'Ready');
      document.getElementById('generate-btn').disabled = writer.status === 'RUNNING';
      document.getElementById('eval-btn').disabled = active.status === 'RUNNING';

      if (writer.status === 'RUNNING') {
        document.getElementById('m-total').textContent = 'RUNNING';
        document.getElementById('m-total').className = 'metric warn';
      } else {
        setMetric('m-total', metrics.total_testcases);
      }
      setMetric('m-ready', metrics.ready_percent, '%');
      setMetric('m-review', metrics.review_required);
      setMetric('m-coverage', metrics.coverage_score, '%');
      setMetric('m-trace', metrics.traceability_percent, '%');
      document.getElementById('m-source').textContent = pack && pack.source ? pack.source : 'No generation yet';

      renderTestcases(pack);
      renderCoverage(pack);
      renderEval(state.summary);

      var log = active.log_path ? await fetch('/api/log').then(function (r) { return r.text(); }).catch(function () { return ''; }) : '';
      document.getElementById('run-log').textContent = log || 'No active run log.';
    }
    document.getElementById('demo-link').href = window.location.origin + '/demo';
    document.getElementById('generate-btn').addEventListener('click', async function () {
      var githubUrl = document.getElementById('github-url').value.trim();
      var localPath = document.getElementById('local-path').value.trim();
      var requirementsText = document.getElementById('requirements-text').value;
      await getJson('/api/testcases/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ githubUrl: githubUrl, localPath: localPath, requirementsText: requirementsText })
      });
      refresh();
    });
    document.getElementById('eval-btn').addEventListener('click', async function () {
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
  if (req.method === 'GET' && url.pathname === '/api/testcases/latest') {
    send(res, 200, latestWriterOutput || readJson(OUTPUT_FILE, { testcases: [] }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/testcases/export.json') {
    send(res, 200, latestWriterOutput || readJson(OUTPUT_FILE, { testcases: [] }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/testcases/export.csv') {
    send(res, 200, toCsv(latestWriterOutput || readJson(OUTPUT_FILE, { testcases: [] })), 'text/csv; charset=utf-8');
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
  if (req.method === 'POST' && url.pathname === '/api/testcases/generate') {
    try {
      const body = await readBody(req);
      const githubUrl = body.githubUrl && body.githubUrl.trim() ? body.githubUrl.trim() : '';
      const options = {
        githubUrl,
        localPath: githubUrl ? '' : (body.localPath || ROOT),
        requirementsText: body.requirementsText || ''
      };
      const result = startWriterRun(options);
      send(res, result.ok ? 202 : 409, result);
    } catch (error) {
      send(res, 400, { error: error.message });
    }
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
  console.log(`AI QA Test Case Writer listening on http://127.0.0.1:${PORT}`);
});
