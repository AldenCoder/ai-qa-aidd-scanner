const fs = require('fs');
const path = require('path');
const { prepareTarget, walk, safeRead, rel, discoverApi, detectStack } = require('./scanner');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT, 'testcase', 'generated', 'latest_writer_output.json');
const DOC_EXT = /\.(md|markdown|txt|rst|adoc|json|ya?ml)$/i;
const UI_EXT = /\.(html|jsx|tsx|vue|svelte|js|ts)$/i;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function asciiFold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function compact(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function source(file, section) {
  return [{ file, section: section || 'Detected content' }];
}

function addCase(list, input) {
  const id = `TC-${String(list.length + 1).padStart(3, '0')}`;
  list.push({
    test_case_id: id,
    module: input.module || 'General',
    title: compact(input.title, 140),
    type: input.type || 'functional',
    priority: input.priority || 'MEDIUM',
    preconditions: input.preconditions || ['Tester has access to the target environment and valid baseline data.'],
    test_data: input.test_data || {},
    steps: input.steps || [
      'Prepare the test data.',
      'Execute the related user flow or API request.',
      'Compare actual behavior with the expected result.'
    ],
    expected_result: input.expected_result || 'Actual behavior matches the requirement.',
    sources: input.sources || [],
    review_status: input.review_status || 'READY',
    review_notes: input.review_notes || '',
    automation_hint: input.automation_hint || 'Candidate for manual test first; automate after tester approval.'
  });
}

function moduleFromPath(relativePath) {
  const clean = relativePath.replace(/\\/g, '/');
  const parts = clean.split('/').filter(Boolean);
  const file = parts[parts.length - 1] || clean;
  return file
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function looksLikeRequirement(line) {
  const text = asciiFold(line);
  if (text.length < 18 || text.length > 420) return false;
  if (/^(http|https):\/\//.test(text)) return false;
  const keywords = [
    'must',
    'shall',
    'should',
    'required',
    'validate',
    'reject',
    'accept',
    'error',
    'success',
    'display',
    'allow',
    'cannot',
    'phai',
    'bat buoc',
    'kiem tra',
    'tu choi',
    'chap nhan',
    'hien thi',
    'khong duoc',
    'loi',
    'thanh cong',
    'br-',
    'rule'
  ];
  return keywords.some((keyword) => text.includes(keyword));
}

function classifyRequirement(line) {
  const text = asciiFold(line);
  const result = {
    module: 'Functional',
    type: 'functional_positive',
    priority: 'MEDIUM'
  };

  if (/api|endpoint|http|request|response|status code/.test(text)) {
    result.module = 'API';
    result.type = 'api_contract';
  }
  if (/ui|screen|page|form|button|field|input|click|display|man hinh|hien thi/.test(text)) {
    result.module = 'UI';
    result.type = 'ui_functional';
  }
  if (/auth|token|password|permission|role|security|xss|sql|injection|bao mat/.test(text)) {
    result.module = 'Security';
    result.type = 'security_negative';
    result.priority = 'HIGH';
  }
  if (/min|max|between|range|limit|boundary|toi thieu|toi da|gioi han/.test(text)) {
    result.type = 'boundary';
    result.priority = 'HIGH';
  }
  if (/required|mandatory|blank|empty|null|invalid|reject|cannot|bat buoc|khong duoc|tu choi|loi/.test(text)) {
    result.type = result.type === 'boundary' ? 'boundary_negative' : 'negative';
    result.priority = 'HIGH';
  }

  return result;
}

function extractRequirements(root, files, requirementsText) {
  const requirements = [];
  if (requirementsText && requirementsText.trim()) {
    requirementsText
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*+\d.)\s]+/, '').trim())
      .filter(looksLikeRequirement)
      .slice(0, 30)
      .forEach((line, index) => {
        requirements.push({
          text: line,
          file: 'inline-input',
          section: `Line ${index + 1}`,
          module: 'Manual Input'
        });
      });
  }

  const docFiles = files
    .filter((file) => DOC_EXT.test(file))
    .filter((file) => !/package-lock\.json$|latest_writer_output\.json$/i.test(file))
    .slice(0, 120);

  for (const file of docFiles) {
    const relative = rel(root, file);
    const content = safeRead(file);
    if (!content) continue;
    let section = moduleFromPath(relative);
    let inFence = false;
    const lines = content.split(/\r?\n/);

    lines.forEach((raw, index) => {
      const trimmed = raw.trim();
      if (/^```/.test(trimmed)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;
      const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        section = compact(heading[1], 80);
        return;
      }
      const normalized = trimmed.replace(/^[-*+\d.)\s]+/, '').trim();
      if (looksLikeRequirement(normalized)) {
        requirements.push({
          text: normalized,
          file: relative,
          section: `${section} / line ${index + 1}`,
          module: moduleFromPath(relative)
        });
      }
    });
  }

  const unique = new Map();
  for (const item of requirements) {
    const key = asciiFold(`${item.file}:${item.text}`).slice(0, 260);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].slice(0, 80);
}

function extractUiSurfaces(root, files) {
  return files
    .filter((file) => UI_EXT.test(file))
    .map((file) => {
      const relative = rel(root, file);
      const content = safeRead(file);
      const fieldNames = [];
      const inputRe = /<(?:input|select|textarea)\b[^>]*(?:name|id)=["']([^"']+)["'][^>]*>/gi;
      let match;
      while ((match = inputRe.exec(content)) && fieldNames.length < 10) {
        fieldNames.push(match[1]);
      }
      const hasForm = /<form\b|onSubmit|submit/i.test(content);
      const hasButton = /<button\b|role=["']button|type=["']submit/i.test(content);
      if (!hasForm && !hasButton && fieldNames.length === 0) return null;
      return {
        file: relative,
        module: moduleFromPath(relative),
        fields: [...new Set(fieldNames)],
        hasForm,
        hasButton
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function titleForRequirement(requirement, classifier) {
  if (classifier.type.includes('boundary')) return `Verify boundary rule: ${compact(requirement.text, 90)}`;
  if (classifier.type === 'negative') return `Verify validation rule: ${compact(requirement.text, 90)}`;
  if (classifier.module === 'Security') return `Verify security rule: ${compact(requirement.text, 90)}`;
  return `Verify requirement: ${compact(requirement.text, 100)}`;
}

function addRequirementCases(cases, requirements) {
  for (const requirement of requirements.slice(0, 36)) {
    const classifier = classifyRequirement(requirement.text);
    addCase(cases, {
      module: classifier.module === 'Functional' ? requirement.module : classifier.module,
      title: titleForRequirement(requirement, classifier),
      type: classifier.type,
      priority: classifier.priority,
      test_data: {
        requirement: compact(requirement.text, 220)
      },
      steps: [
        'Read the linked requirement/source section.',
        'Prepare valid or invalid data according to the test type.',
        'Execute the related user flow or API request.',
        'Record actual result and evidence.'
      ],
      expected_result: `System behavior matches this requirement: ${compact(requirement.text, 240)}`,
      sources: source(requirement.file, requirement.section),
      review_status: /todo|tbd|can xac nhan|chua ro|unknown|missing/i.test(asciiFold(requirement.text))
        ? 'REVIEW_REQUIRED'
        : 'READY',
      review_notes: /todo|tbd|can xac nhan|chua ro|unknown|missing/i.test(asciiFold(requirement.text))
        ? 'Requirement is ambiguous and needs tester/BA confirmation.'
        : '',
      automation_hint: classifier.module === 'UI'
        ? 'Automate with Playwright after selector mapping is confirmed.'
        : classifier.module === 'API'
          ? 'Automate with API contract tests after payload schema is confirmed.'
          : 'Can be automated after the tester approves the expected result.'
    });
  }
}

function addApiCases(cases, endpoints) {
  for (const endpoint of endpoints.slice(0, 24)) {
    const endpointLabel = `${endpoint.method} ${endpoint.path}`;
    addCase(cases, {
      module: 'API',
      title: `Verify API contract for ${endpointLabel}`,
      type: 'api_contract',
      priority: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(endpoint.method) ? 'HIGH' : 'MEDIUM',
      test_data: {
        method: endpoint.method,
        path: endpoint.path,
        payload: endpoint.method === 'GET' ? null : 'Valid payload based on API documentation'
      },
      steps: [
        `Send ${endpoint.method} request to ${endpoint.path}.`,
        'Validate HTTP status code.',
        'Validate response body fields and error format.',
        'Save request/response evidence.'
      ],
      expected_result: `${endpointLabel} returns the documented response and does not expose internal errors.`,
      sources: source(endpoint.file, endpointLabel),
      automation_hint: 'Good candidate for API automation.'
    });

    if (/\{id\}|:id|\(controller route\)|\/id\b/i.test(endpoint.path) || endpoint.path.includes('{')) {
      addCase(cases, {
        module: 'API',
        title: `Verify not-found handling for ${endpointLabel}`,
        type: 'api_negative',
        priority: 'HIGH',
        test_data: {
          method: endpoint.method,
          path: endpoint.path,
          id: 'non-existing-id'
        },
        steps: [
          `Send ${endpoint.method} request to ${endpoint.path} with a non-existing id.`,
          'Validate HTTP status code.',
          'Validate response body does not leak stack trace.'
        ],
        expected_result: 'API returns a controlled 404 or business error response.',
        sources: source(endpoint.file, endpointLabel),
        automation_hint: 'Good candidate for API negative automation.'
      });
    }

    if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      addCase(cases, {
        module: 'API',
        title: `Verify required-field validation for ${endpointLabel}`,
        type: 'api_negative',
        priority: 'HIGH',
        test_data: {
          method: endpoint.method,
          path: endpoint.path,
          payload: 'Remove one required field at a time'
        },
        steps: [
          `Send ${endpoint.method} request to ${endpoint.path} with missing required fields.`,
          'Repeat for each required field discovered from documentation or form schema.',
          'Validate status code and validation message.'
        ],
        expected_result: 'API rejects invalid payload with clear validation messages.',
        sources: source(endpoint.file, endpointLabel),
        automation_hint: 'Good candidate for data-driven API tests.'
      });
    }
  }
}

function addUiCases(cases, uiSurfaces) {
  for (const surface of uiSurfaces.slice(0, 16)) {
    const fields = surface.fields.length ? surface.fields.join(', ') : 'visible fields';
    addCase(cases, {
      module: 'UI',
      title: `Verify UI form behavior in ${surface.module}`,
      type: 'ui_functional',
      priority: 'MEDIUM',
      test_data: {
        fields
      },
      steps: [
        `Open the screen related to ${surface.file}.`,
        `Confirm these fields/actions are visible: ${fields}.`,
        'Enter valid data and submit.',
        'Check success state and persistence/result display.'
      ],
      expected_result: 'The screen renders correctly, accepts valid data, and shows a clear result.',
      sources: source(surface.file, 'UI surface'),
      automation_hint: 'Candidate for Playwright after route and selectors are confirmed.'
    });

    if (surface.fields.length) {
      addCase(cases, {
        module: 'UI',
        title: `Verify required-field validation in ${surface.module}`,
        type: 'ui_negative',
        priority: 'HIGH',
        test_data: {
          fields: surface.fields
        },
        steps: [
          `Open the screen related to ${surface.file}.`,
          'Leave required fields blank one by one.',
          'Submit the form.',
          'Check field-level validation messages.'
        ],
        expected_result: 'The UI blocks submission and displays clear validation messages near the invalid fields.',
        sources: source(surface.file, 'UI validation'),
        automation_hint: 'Candidate for Playwright validation tests.'
      });
    }
  }
}

function addSecurityCases(cases, endpoints, uiSurfaces, requirements) {
  const hasInput = uiSurfaces.some((surface) => surface.fields.length) || endpoints.some((endpoint) =>
    ['POST', 'PUT', 'PATCH'].includes(endpoint.method)
  );
  const hasSecurityRequirement = requirements.some((item) =>
    /auth|token|password|permission|role|security|xss|sql|injection|bao mat/i.test(asciiFold(item.text))
  );

  if (hasInput) {
    const primarySource = uiSurfaces[0]
      ? source(uiSurfaces[0].file, 'Input validation')
      : source(endpoints.find((endpoint) => endpoint.method !== 'GET').file, 'API input');
    addCase(cases, {
      module: 'Security',
      title: 'Verify text input rejects script payload',
      type: 'security_negative',
      priority: 'HIGH',
      test_data: {
        payload: '<script>alert(1)</script>'
      },
      steps: [
        'Submit the script payload through each free-text input or matching API field.',
        'Reload the affected page or fetch the saved record.',
        'Inspect displayed output and response body.'
      ],
      expected_result: 'The payload is escaped, rejected, or safely stored without script execution.',
      sources: primarySource,
      review_status: hasSecurityRequirement ? 'READY' : 'REVIEW_REQUIRED',
      review_notes: hasSecurityRequirement ? '' : 'No explicit security requirement found; confirm expected handling.',
      automation_hint: 'Candidate for API/UI security regression tests.'
    });
  }

  if (endpoints.length) {
    addCase(cases, {
      module: 'Security',
      title: 'Verify protected API behavior without credentials',
      type: 'security_negative',
      priority: 'HIGH',
      test_data: {
        auth: 'none'
      },
      steps: [
        'Identify endpoints that should require authentication or role permission.',
        'Send request without token/session.',
        'Repeat with a user that has insufficient permission.'
      ],
      expected_result: 'Protected endpoints return 401 or 403 and do not return sensitive data.',
      sources: source(endpoints[0].file, 'API authorization checklist'),
      review_status: hasSecurityRequirement ? 'READY' : 'REVIEW_REQUIRED',
      review_notes: hasSecurityRequirement ? '' : 'Authorization rules were not explicit in scanned sources.',
      automation_hint: 'Candidate for API security tests once auth fixtures are available.'
    });
  }
}

function scoreCoverage(cases, requirements, endpoints, uiSurfaces) {
  const buckets = new Set(cases.map((testcase) => testcase.module.toLowerCase()));
  const types = new Set(cases.map((testcase) => testcase.type));
  const checks = [
    requirements.length > 0,
    endpoints.length > 0 || buckets.has('api'),
    uiSurfaces.length > 0 || buckets.has('ui'),
    buckets.has('security'),
    [...types].some((type) => type.includes('negative')),
    [...types].some((type) => type.includes('boundary'))
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function buildGaps(requirements, endpoints, uiSurfaces, cases) {
  const gaps = [];
  if (requirements.length === 0) gaps.push('No clear requirement lines found; add BR/SRS/user stories for stronger expected results.');
  if (endpoints.length === 0) gaps.push('No API endpoints discovered; API test cases are limited.');
  if (uiSurfaces.length === 0) gaps.push('No UI form/screen surfaces discovered; UI test cases are limited.');
  if (!cases.some((testcase) => testcase.type.includes('boundary'))) {
    gaps.push('No boundary rule found; tester should add min/max/equivalence-class cases manually.');
  }
  if (cases.some((testcase) => testcase.review_status === 'REVIEW_REQUIRED')) {
    gaps.push('Some generated cases need BA/tester review before automation.');
  }
  return gaps;
}

async function generateTestcases(options = {}) {
  const started = Date.now();
  const target = prepareTarget(options);
  const files = walk(target.root);
  const pkg = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(target.root, 'package.json'), 'utf8'));
    } catch (error) {
      return null;
    }
  })();
  const stack = detectStack(target.root, files, pkg);
  const requirements = extractRequirements(target.root, files, options.requirementsText || '');
  const endpoints = discoverApi(target.root, files);
  const uiSurfaces = extractUiSurfaces(target.root, files);
  const cases = [];

  addRequirementCases(cases, requirements);
  addApiCases(cases, endpoints);
  addUiCases(cases, uiSurfaces);
  addSecurityCases(cases, endpoints, uiSurfaces, requirements);

  if (cases.length === 0) {
    addCase(cases, {
      module: 'Discovery',
      title: 'Clarify the main business flow before writing test cases',
      type: 'review_required',
      priority: 'HIGH',
      steps: [
        'Collect product requirement, screen list, API specification, and main happy path.',
        'Confirm required fields, validation rules, roles, and error messages.',
        'Generate test cases again after the source documents are available.'
      ],
      expected_result: 'Tester has enough confirmed input to write executable test cases.',
      sources: source(target.source, 'Repository root'),
      review_status: 'REVIEW_REQUIRED',
      review_notes: 'The target does not expose enough requirement/API/UI information.'
    });
  }

  const ready = cases.filter((testcase) => testcase.review_status === 'READY').length;
  const reviewRequired = cases.length - ready;
  const traceable = cases.filter((testcase) => testcase.sources && testcase.sources.length).length;
  const metrics = {
    total_testcases: cases.length,
    ready_testcases: ready,
    review_required: reviewRequired,
    ready_percent: Math.round((ready / cases.length) * 100),
    traceability_percent: Math.round((traceable / cases.length) * 100),
    coverage_score: scoreCoverage(cases, requirements, endpoints, uiSurfaces),
    requirements_found: requirements.length,
    endpoints_found: endpoints.length,
    ui_surfaces_found: uiSurfaces.length
  };

  const output = {
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    source: target.source,
    cloned: target.cloned,
    file_count: files.length,
    stack,
    metrics,
    gaps: buildGaps(requirements, endpoints, uiSurfaces, cases),
    discovered: {
      requirements: requirements.slice(0, 20),
      endpoints: endpoints.slice(0, 50),
      ui_surfaces: uiSurfaces.slice(0, 20)
    },
    testcases: cases
  };

  writeJson(OUTPUT_FILE, output);
  return output;
}

function csvCell(value) {
  const text = Array.isArray(value) || (value && typeof value === 'object')
    ? JSON.stringify(value)
    : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(pack) {
  const headers = [
    'test_case_id',
    'module',
    'title',
    'type',
    'priority',
    'preconditions',
    'test_data',
    'steps',
    'expected_result',
    'sources',
    'review_status',
    'review_notes',
    'automation_hint'
  ];
  const rows = (pack && pack.testcases ? pack.testcases : []).map((testcase) =>
    headers.map((header) => csvCell(testcase[header])).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

module.exports = {
  generateTestcases,
  toCsv,
  OUTPUT_FILE
};
