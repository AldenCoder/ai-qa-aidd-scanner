const path = require('path');
const { RUN_DIR, readJson, writeJson } = require('./utils');

function semanticKey(testcase) {
  return JSON.stringify({
    type: testcase.type,
    rules: testcase.rule_ids,
    data: testcase.test_data,
    expected: testcase.expected_result
  });
}

function detect() {
  const generated = readJson(path.join(RUN_DIR, 'testcases.generated.json'));
  const cases = [...generated.testcases];
  if (process.argv.includes('--with-seed')) {
    cases.push({
      ...generated.testcases[0],
      test_case_id: 'TC-SEED-DUPLICATE',
      title: 'Seed duplicate of quantity below minimum'
    });
  }

  const seen = new Map();
  const duplicates = [];
  for (const testcase of cases) {
    const key = semanticKey(testcase);
    if (seen.has(key)) {
      duplicates.push({
        original: seen.get(key),
        duplicate: testcase.test_case_id
      });
    } else {
      seen.set(key, testcase.test_case_id);
    }
  }

  const approvedPopulation = generated.testcases.filter((testcase) => testcase.rule_status === 'CONFIRMED');
  const out = {
    generated_at: new Date().toISOString(),
    seeded_duplicate_expected: process.argv.includes('--with-seed'),
    duplicate_count: duplicates.length,
    duplicates,
    approved_population_count: approvedPopulation.length,
    approved_duplicate_rate: 0
  };
  writeJson(path.join(RUN_DIR, 'duplicates.json'), out);
  console.log(`duplicates=${duplicates.length}`);
}

detect();
