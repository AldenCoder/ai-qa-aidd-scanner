const path = require('path');
const { ROOT, RUN_DIR, readJson, writeJson } = require('./utils');

function hasMatchingSource(testcase, rule) {
  const ruleSources = new Set(rule.sources.map((source) => `${source.file}#${source.section}`));
  return testcase.sources.some((source) => ruleSources.has(`${source.file}#${source.section}`));
}

function reviewCase(testcase, rulesById) {
  const reasons = [];
  const linkedRules = testcase.rule_ids.map((id) => rulesById[id]).filter(Boolean);
  if (linkedRules.length !== testcase.rule_ids.length) reasons.push('unknown rule');
  for (const rule of linkedRules) {
    if (!hasMatchingSource(testcase, rule)) reasons.push(`source mismatch for ${rule.rule_id}`);
  }

  if (testcase.rule_status === 'CONFIRMED') {
    if (!testcase.expected_result) reasons.push('confirmed testcase has no expected result');
  } else {
    if (testcase.expected_result !== null) reasons.push('missing/conflict testcase has expected result');
  }

  let approval_status = 'APPROVED';
  if (testcase.rule_status !== 'CONFIRMED') approval_status = 'REVIEW_REQUIRED';
  if (reasons.length > 0) approval_status = 'REJECTED';
  return { ...testcase, approval_status, review_reasons: reasons };
}

function review() {
  const matrix = readJson(path.join(RUN_DIR, 'rule_matrix.json'));
  const generated = readJson(path.join(RUN_DIR, 'testcases.generated.json'));
  const rulesById = Object.fromEntries(matrix.rules.map((rule) => [rule.rule_id, rule]));
  const reviewed = generated.testcases.map((testcase) => reviewCase(testcase, rulesById));

  const seedWrongSource = {
    test_case_id: 'TC-SEED-WRONG-SOURCE',
    title: 'Seeded testcase with wrong source',
    type: 'reviewer_negative',
    priority: 'HIGH',
    preconditions: [],
    test_data: { quantity: 75 },
    steps: ['Submit quantity 75'],
    expected_result: 'Order is rejected because quantity max is 50.',
    rule_ids: ['R-ORDER-001'],
    sources: [
      {
        file: 'evals/fixtures/conflict/api-order-v2-conflict.md',
        section: 'BR-06 Quantity Maximum Conflict'
      }
    ],
    rule_status: 'CONFIRMED',
    approval_status: 'GENERATED'
  };
  const reviewedSeed = reviewCase(seedWrongSource, rulesById);

  const approved = reviewed.filter((testcase) => testcase.approval_status === 'APPROVED');
  const reviewRequired = reviewed.filter((testcase) => testcase.approval_status === 'REVIEW_REQUIRED');
  const rejected = reviewed.filter((testcase) => testcase.approval_status === 'REJECTED').concat(reviewedSeed);
  const out = {
    generated_at: new Date().toISOString(),
    reviewed_count: reviewed.length,
    approved_count: approved.length,
    review_required_count: reviewRequired.length,
    rejected_count: rejected.length,
    reviewer_seed_rejected: reviewedSeed.approval_status === 'REJECTED',
    approved,
    review_required: reviewRequired,
    rejected
  };

  writeJson(path.join(RUN_DIR, 'review.json'), out);
  writeJson(path.join(RUN_DIR, 'approved_testcases.json'), { testcases: approved });
  writeJson(path.join(ROOT, 'testcase', 'approved', 'approved_testcases.json'), { testcases: approved });
  writeJson(path.join(ROOT, 'testcase', 'rejected', 'rejected_testcases.json'), { testcases: rejected });
  console.log(`approved=${approved.length} review_required=${reviewRequired.length} rejected=${rejected.length}`);
}

review();
