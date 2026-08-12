const fs = require('fs');
const path = require('path');
const { ROOT, RUN_DIR, readJson } = require('./utils');

function generate() {
  const approved = readJson(path.join(RUN_DIR, 'approved_testcases.json')).testcases;
  const ids = new Set(approved.map((testcase) => testcase.test_case_id));
  const required = [
    'TC-ORDER-001',
    'TC-ORDER-002',
    'TC-ORDER-003',
    'TC-ORDER-004',
    'TC-ORDER-005',
    'TC-ORDER-006',
    'TC-ORDER-007',
    'TC-ORDER-008'
  ];
  const missing = required.filter((id) => !ids.has(id));
  if (missing.length > 0) {
    throw new Error(`Cannot generate automation; missing approved cases: ${missing.join(', ')}`);
  }

  const content = `const { test, expect } = require('@playwright/test');

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const validOrder = () => ({
  customer: 'Alice',
  productId: 'P-001',
  quantity: 1,
  deliveryDate: dateOffset(1)
});

test.describe('Generated API tests from approved cases', () => {
  // TC-ORDER-002; rules: R-ORDER-001
  test('API accepts quantity lower boundary', async ({ request }) => {
    const response = await request.post('/api/orders', { data: { ...validOrder(), quantity: 1 } });
    expect(response.status()).toBe(201);
  });

  // TC-ORDER-003; rules: R-ORDER-001
  test('API accepts quantity upper boundary', async ({ request }) => {
    const response = await request.post('/api/orders', { data: { ...validOrder(), quantity: 100 } });
    expect(response.status()).toBe(201);
  });

  // TC-ORDER-001; rules: R-ORDER-001
  test('API rejects quantity below minimum', async ({ request }) => {
    const response = await request.post('/api/orders', { data: { ...validOrder(), quantity: 0 } });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body.errors)).toContain('quantity');
  });

  // TC-ORDER-004; rules: R-ORDER-001
  test('API rejects quantity above maximum', async ({ request }) => {
    const response = await request.post('/api/orders', { data: { ...validOrder(), quantity: 101 } });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body.errors)).toContain('quantity');
  });

  // TC-ORDER-005; rules: R-ORDER-002
  test('API rejects blank customer', async ({ request }) => {
    const response = await request.post('/api/orders', { data: { ...validOrder(), customer: ' ' } });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body.errors)).toContain('customer');
  });

  // TC-ORDER-006; rules: R-ORDER-003
  test('API rejects unknown product', async ({ request }) => {
    const response = await request.post('/api/orders', { data: { ...validOrder(), productId: 'P-404' } });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body.errors)).toContain('productId');
  });

  // TC-ORDER-007; rules: R-ORDER-004
  test('API rejects past delivery date', async ({ request }) => {
    const response = await request.post('/api/orders', { data: { ...validOrder(), deliveryDate: dateOffset(-1) } });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(JSON.stringify(body.errors)).toContain('deliveryDate');
  });

  // TC-ORDER-008; rules: R-ORDER-006
  test('API returns 404 for unknown order id', async ({ request }) => {
    const response = await request.get('/api/orders/ORD-404');
    expect(response.status()).toBe(404);
  });
});

test.describe('Generated web tests from approved cases', () => {
  async function fillValidForm(page) {
    await page.goto('/');
    await page.getByLabel('Customer').fill('Alice');
    await page.getByLabel('Product').selectOption('P-001');
    await page.getByLabel('Quantity').fill('1');
    await page.getByLabel('Delivery date').fill(dateOffset(1));
  }

  // TC-ORDER-002; rules: R-ORDER-001
  test('Web creates an order at quantity minimum', async ({ page }) => {
    await fillValidForm(page);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('status')).toContainText('Order created');
  });

  // TC-ORDER-003; rules: R-ORDER-001
  test('Web creates an order at quantity maximum', async ({ page }) => {
    await fillValidForm(page);
    await page.getByLabel('Quantity').fill('100');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('status')).toContainText('Order created');
  });

  // TC-ORDER-001; rules: R-ORDER-001
  test('Web rejects quantity zero', async ({ page }) => {
    await fillValidForm(page);
    await page.getByLabel('Quantity').fill('0');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('status')).toContainText('quantity');
  });

  // TC-ORDER-005; rules: R-ORDER-002
  test('Web rejects blank customer', async ({ page }) => {
    await fillValidForm(page);
    await page.getByLabel('Customer').fill('');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('status')).toContainText('customer');
  });
});
`;

  const filePath = path.join(ROOT, 'tests', 'generated', 'order.spec.js');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`generated=${path.relative(ROOT, filePath)}`);
}

generate();
