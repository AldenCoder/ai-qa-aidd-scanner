const path = require('path');
const { ROOT, RUN_DIR, readJson, writeJson, todayIso } = require('./utils');

const VALID_BASE = {
  customer: 'Alice',
  productId: 'P-001',
  quantity: 1,
  deliveryDate: todayIso(1)
};

function sourceFor(rule) {
  return rule.sources.map((source) => ({ file: source.file, section: source.section }));
}

function tc(id, title, type, rule, testData, expected) {
  return {
    test_case_id: id,
    title,
    type,
    priority: 'HIGH',
    preconditions: ['Demo Order App is running with default product catalog.'],
    test_data: { ...VALID_BASE, ...testData },
    steps: ['Open order form or call POST /api/orders', 'Submit test data', 'Observe response'],
    expected_result: expected,
    rule_ids: [rule.rule_id],
    sources: sourceFor(rule),
    rule_status: rule.status,
    approval_status: rule.status === 'CONFIRMED' ? 'GENERATED' : 'REVIEW_REQUIRED'
  };
}

function generate() {
  const matrix = readJson(path.join(RUN_DIR, 'rule_matrix.json'));
  const byId = Object.fromEntries(matrix.rules.map((rule) => [rule.rule_id, rule]));
  const testcases = [
    tc(
      'TC-ORDER-001',
      'Reject quantity below minimum',
      'boundary_negative',
      byId['R-ORDER-001'],
      { quantity: 0 },
      'Order is rejected because quantity must be between 1 and 100.'
    ),
    tc(
      'TC-ORDER-002',
      'Accept minimum quantity',
      'boundary_positive',
      byId['R-ORDER-001'],
      { quantity: 1 },
      'Order is created when quantity is 1 and all other fields are valid.'
    ),
    tc(
      'TC-ORDER-003',
      'Accept maximum quantity',
      'boundary_positive',
      byId['R-ORDER-001'],
      { quantity: 100 },
      'Order is created when quantity is 100 and all other fields are valid.'
    ),
    tc(
      'TC-ORDER-004',
      'Reject quantity above maximum',
      'boundary_negative',
      byId['R-ORDER-001'],
      { quantity: 101 },
      'Order is rejected because quantity must be between 1 and 100.'
    ),
    tc(
      'TC-ORDER-005',
      'Reject blank customer',
      'required_field_negative',
      byId['R-ORDER-002'],
      { customer: ' ' },
      'Order is rejected because customer is required.'
    ),
    tc(
      'TC-ORDER-006',
      'Reject unknown product',
      'negative',
      byId['R-ORDER-003'],
      { productId: 'P-404' },
      'Order is rejected because product ID does not exist.'
    ),
    tc(
      'TC-ORDER-007',
      'Reject past delivery date',
      'boundary_negative',
      byId['R-ORDER-004'],
      { deliveryDate: todayIso(-1) },
      'Order is rejected because delivery date is before today.'
    ),
    tc(
      'TC-ORDER-008',
      'Return 404 for unknown order ID',
      'api_negative',
      byId['R-ORDER-006'],
      { orderId: 'ORD-404' },
      'GET /api/orders/{id} returns HTTP 404 for an unknown order ID.'
    ),
    tc(
      'TC-ORDER-009',
      'Maximum total order value requires definition',
      'missing_rule',
      byId['R-ORDER-005'],
      { orderTotal: 1000000 },
      null
    ),
    tc(
      'TC-ORDER-010',
      'Quantity maximum conflict requires resolution',
      'conflict_rule',
      byId['R-EVAL-CONFLICT-001'],
      { quantity: 75 },
      null
    )
  ];

  const out = {
    generated_at: new Date().toISOString(),
    testcases
  };
  writeJson(path.join(RUN_DIR, 'testcases.generated.json'), out);
  writeJson(path.join(ROOT, 'testcase', 'generated', 'testcases.json'), out);
  console.log(`testcases=${testcases.length}`);
}

generate();
