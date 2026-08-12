const http = require('http');

const PORT = Number(process.env.PORT || 3100);
const BUG_MODE = process.env.BUG_MODE || '';
const products = [
  { id: 'P-001', name: 'Notebook', price: 10 },
  { id: 'P-002', name: 'Pen', price: 2 }
];
const orders = new Map();

function todayIso(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function send(res, status, payload, headers = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': typeof payload === 'string' ? 'text/html; charset=utf-8' : 'application/json',
    ...headers
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function validateOrder(body) {
  const errors = [];
  const quantity = Number(body.quantity);
  const lowerLimit = BUG_MODE === 'quantity_zero_allowed' ? 0 : 1;

  if (!body.customer || String(body.customer).trim() === '') {
    errors.push({ field: 'customer', message: 'customer is required' });
  }
  if (!Number.isInteger(quantity) || quantity < lowerLimit || quantity > 100) {
    errors.push({ field: 'quantity', message: 'quantity must be between 1 and 100' });
  }
  if (!products.some((product) => product.id === body.productId)) {
    errors.push({ field: 'productId', message: 'productId must exist' });
  }
  if (!body.deliveryDate || String(body.deliveryDate) < todayIso()) {
    errors.push({ field: 'deliveryDate', message: 'deliveryDate must be today or later' });
  }
  return errors;
}

function renderIndex() {
  const productOptions = products
    .map((product) => `<option value="${product.id}">${product.name}</option>`)
    .join('');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Demo Order App</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 32px; max-width: 680px; }
      label { display: block; margin: 14px 0 6px; font-weight: 700; }
      input, select, button { font-size: 16px; padding: 8px; width: 280px; }
      button { width: auto; margin-top: 18px; cursor: pointer; }
      [role="status"] { margin-top: 18px; padding: 10px; min-height: 20px; border-left: 4px solid #777; }
    </style>
  </head>
  <body>
    <h1>Demo Order App</h1>
    <form id="order-form">
      <label for="customer">Customer</label>
      <input id="customer" name="customer" autocomplete="off" />
      <label for="product">Product</label>
      <select id="product" name="productId">${productOptions}</select>
      <label for="quantity">Quantity</label>
      <input id="quantity" name="quantity" type="number" />
      <label for="deliveryDate">Delivery date</label>
      <input id="deliveryDate" name="deliveryDate" type="date" />
      <button type="submit">Submit</button>
    </form>
    <div id="message" role="status" aria-live="polite"></div>
    <script>
      document.getElementById('deliveryDate').value = '${todayIso(1)}';
      document.getElementById('order-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.target);
        const payload = Object.fromEntries(form.entries());
        payload.quantity = Number(payload.quantity);
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        const message = document.getElementById('message');
        if (response.ok) {
          message.textContent = 'Order created: ' + body.id;
        } else {
          message.textContent = body.errors.map((error) => error.field + ': ' + error.message).join('; ');
        }
      });
    </script>
  </body>
</html>`;
}

function createDemoHandler(homePaths = ['/']) {
  return async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && homePaths.includes(url.pathname)) {
    send(res, 200, renderIndex());
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/products') {
    send(res, 200, { products });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/orders') {
    try {
      const body = await readBody(req);
      const errors = validateOrder(body);
      if (errors.length > 0) {
        send(res, 400, { errors });
        return;
      }
      const id = `ORD-${orders.size + 1}`;
      const order = { id, ...body };
      orders.set(id, order);
      send(res, 201, order);
    } catch (error) {
      send(res, 400, { errors: [{ field: 'body', message: 'invalid JSON' }] });
    }
    return;
  }
  const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (req.method === 'GET' && orderMatch) {
    const order = orders.get(orderMatch[1]);
    if (!order) {
      send(res, 404, { error: 'order not found' });
      return;
    }
    send(res, 200, order);
    return;
  }
  send(res, 404, { error: 'not found' });
  };
}

if (require.main === module) {
  const server = http.createServer(createDemoHandler(['/']));
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Demo Order App listening on http://127.0.0.1:${PORT} bugMode=${BUG_MODE || 'off'}`);
  });
}

module.exports = {
  createDemoHandler,
  products,
  todayIso
};
