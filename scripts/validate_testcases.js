const path = require('path');
const { RUN_DIR, readJson, writeJson } = require('./utils');

const VALID_STATUSES = new Set(['CONFIRMED', 'INFERRED', 'MISSING', 'CONFLICT']);
const VALID_APPROVAL = new Set(['GENERATED', 'VALIDATED', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED']);

function validateCase(testcase, knownRules) {
  const errors = [];
  for (const field of [
    'test_case_id',
    'title',
    'type',
    'priority',
    'test_data',
    'steps',
    'rule_ids',
    'sources',
    'rule_status',
    'approval_status'
  ]) {
    if (!(field in testcase)) errors.push(`missing ${field}`);
  }
  if (!VALID_STATUSES.has(testcase.rule_status)) errors.push('invalid rule_status');
  if (!VALID_APPROVAL.has(testcase.approval_status)) errors.push('invalid approval_status');
  if (!Array.isArray(testcase.rule_ids) || testcase.rule_ids.length === 0) errors.push('missing rule_ids');
  if (!Array.isArray(testcase.sources) || testcase.sources.length === 0) errors.push('missing sources');

  const linkedRules = (testcase.rule_ids || []).map((id) => knownRules[id]).filter(Boolean);
  if (linkedRules.length !== (testcase.rule_ids || []).length) errors.push('unknown rule id');
  if (linkedRules.some((rule) => rule.status !== testcase.rule_status)) errors.push('rule_status mismatch');

  if (testcase.rule_status === 'CONFIRMED') {
    if (!testcase.expected_result) errors.push('confirmed testcase missing expected_result');
  }
  if (['MISSING', 'CONFLICT'].includes(testcase.rule_status)) {
    if (testcase.expected_result !== null) errors.push('unsupported expected_result for missing/conflict');
    if (testcase.approval_status !== 'REVIEW_REQUIRED') errors.push('missing/conflict must require review');
  }

  return errors;
}

function validate() {
  const matrix = readJson(path.join(RUN_DIR, 'rule_matrix.json'));
  const generated = readJson(path.join(RUN_DIR, 'testcases.generated.json'));
  const knownRules = Object.fromEntries(matrix.rules.map((rule) => [rule.rule_id, rule]));
  const caseResults = generated.testcases.map((testcase) => ({
    test_case_id: testcase.test_case_id,
    errors: validateCase(testcase, knownRules)
  }));
  const invalid = caseResults.filter((result) => result.errors.length > 0);
  const unsupportedExpected = caseResults.filter((result) =>
    result.errors.some((error) => error.includes('unsupported expected_result'))
  );
  const out = {
    generated_at: new Date().toISOString(),
    total: caseResults.length,
    valid: caseResults.length - invalid.length,
    invalid: invalid.length,
    unsupported_expected_result_count: unsupportedExpected.length,
    case_results: caseResults
  };
  writeJson(path.join(RUN_DIR, 'validation.json'), out);
  console.log(`valid=${out.valid}/${out.total}`);
  if (invalid.length > 0) process.exitCode = 1;
}

validate();
