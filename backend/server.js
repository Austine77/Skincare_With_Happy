require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const isLocal = process.env.NODE_ENV !== 'production';
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const backendUrl = (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false }
    : false,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || frontendUrl, credentials: true }));
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); } }));

const makeReference = () => `SWH-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const cleanEmail = value => String(value || '').trim().toLowerCase();

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'Skincare With Happy API', environment: process.env.NODE_ENV || 'development' });
  } catch {
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    const params = [];
    const where = ['active = true'];
    if (q) { params.push(`%${q}%`); where.push(`(name ILIKE $${params.length} OR category ILIKE $${params.length} OR description ILIKE $${params.length})`); }
    if (category && category !== 'All') { params.push(category); where.push(`category = $${params.length}`); }
    const { rows } = await pool.query(`SELECT id,name,slug,category,description,price,old_price,image_url,stock,rating FROM products WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load products' });
  }
});

app.get('/api/products/:slug', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE slug=$1 AND active=true', [req.params.slug]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load product' });
  }
});

async function verifyPaystack(reference) {
  if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
  });
  const data = await response.json();
  if (!response.ok || !data.status) throw new Error(data.message || 'Paystack verification failed');
  return data.data;
}

async function completePaidOrder(reference, transaction) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT * FROM orders WHERE reference=$1 FOR UPDATE', [reference]);
    const order = orderResult.rows[0];
    if (!order) throw new Error('Order not found');
    if (order.payment_status === 'paid') { await client.query('COMMIT'); return order; }

    const amountExpected = Math.round(Number(order.total) * 100);
    if (transaction.status !== 'success' || transaction.currency !== order.currency || Number(transaction.amount) !== amountExpected) {
      throw new Error('Payment amount or status could not be verified');
    }

    const itemResult = await client.query('SELECT oi.product_id, oi.quantity, p.name, p.stock FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 FOR UPDATE', [order.id]);
    for (const item of itemResult.rows) {
      if (item.stock < item.quantity) throw new Error(`${item.name} is no longer available in the requested quantity`);
    }
    for (const item of itemResult.rows) {
      await client.query('UPDATE products SET stock=stock-$1, updated_at=NOW() WHERE id=$2', [item.quantity, item.product_id]);
    }

    const updated = await client.query(`UPDATE orders SET payment_status='paid', status='processing', payment_reference=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [transaction.reference, order.id]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

app.post('/api/orders', async (req, res) => {
  const { customer, items } = req.body || {};
  if (!customer?.name || !customer?.email || !customer?.phone || !customer?.address || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Complete customer details and cart items are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requested = items.map(i => ({ id: Number(i.product_id), qty: Number(i.quantity) }));
    if (requested.some(i => !Number.isInteger(i.id) || !Number.isInteger(i.qty) || i.qty < 1)) throw new Error('Invalid cart items');
    const ids = [...new Set(requested.map(i => i.id))];
    const { rows: products } = await client.query('SELECT id,name,price,stock FROM products WHERE id=ANY($1::int[]) AND active=true', [ids]);
    if (products.length !== ids.length) throw new Error('One or more products are unavailable');
    let total = 0;
    for (const item of requested) {
      const product = products.find(p => p.id === item.id);
      if (product.stock < item.qty) throw new Error(`${product.name} has only ${product.stock} item(s) available`);
      total += Number(product.price) * item.qty;
    }
    const email = cleanEmail(customer.email);
    const customerResult = await client.query(`INSERT INTO customers(name,email,phone,address) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,address=EXCLUDED.address RETURNING id`, [String(customer.name).trim(), email, String(customer.phone).trim(), String(customer.address).trim()]);
    const reference = makeReference();
    const orderResult = await client.query(`INSERT INTO orders(customer_id,reference,total) VALUES($1,$2,$3) RETURNING id,reference,total,currency,status,payment_status`, [customerResult.rows[0].id, reference, total]);
    for (const item of requested) {
      const product = products.find(p => p.id === item.id);
      await client.query('INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES($1,$2,$3,$4)', [orderResult.rows[0].id, product.id, item.qty, product.price]);
    }
    await client.query('COMMIT');

    if (!process.env.PAYSTACK_SECRET_KEY) return res.status(201).json({ order: orderResult.rows[0], authorization_url: null, reference, payment_required: true, message: 'Order created. Configure PAYSTACK_SECRET_KEY to enable payment.' });

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: Math.round(total * 100), currency: 'NGN', reference, callback_url: `${backendUrl}/api/paystack/callback`, metadata: { order_reference: reference } })
    });
    const data = await response.json();
    if (!response.ok || !data.status) throw new Error(data.message || 'Payment initialization failed');
    res.status(201).json({ order: orderResult.rows[0], authorization_url: data.data.authorization_url, reference });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error(error);
    res.status(400).json({ error: error.message || 'Unable to create order' });
  } finally { client.release(); }
});

app.post('/api/paystack/verify/:reference', async (req, res) => {
  try {
    const transaction = await verifyPaystack(req.params.reference);
    const order = await completePaidOrder(req.params.reference, transaction);
    res.json({ ok: true, order });
  } catch (error) {
    console.error(error);
    res.status(400).json({ ok: false, error: error.message || 'Payment verification failed' });
  }
});

app.get('/api/paystack/callback', async (req, res) => {
  const reference = String(req.query.reference || '');
  if (!reference) return res.redirect(`${frontendUrl}/cart?payment=missing`);
  try {
    const transaction = await verifyPaystack(reference);
    await completePaidOrder(reference, transaction);
    res.redirect(`${frontendUrl}/cart?payment=success&reference=${encodeURIComponent(reference)}`);
  } catch (error) {
    console.error(error);
    res.redirect(`${frontendUrl}/cart?payment=failed&reference=${encodeURIComponent(reference)}`);
  }
});

app.post('/api/paystack/webhook', async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  if (!process.env.PAYSTACK_SECRET_KEY || !signature) return res.status(401).send('Unauthorized');
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(req.rawBody || Buffer.from(JSON.stringify(req.body))).digest('hex');
  if (signature !== expected) return res.status(401).send('Invalid signature');
  res.sendStatus(200);
  if (req.body?.event === 'charge.success' && req.body?.data?.reference) {
    try { await completePaidOrder(req.body.data.reference, req.body.data); } catch (error) { console.error('Webhook order completion failed:', error); }
  }
});

app.get('/api/orders/:reference', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT o.reference,o.status,o.payment_status,o.total,o.currency,o.payment_reference,o.created_at,c.name,c.email,c.phone,c.address FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.reference=$1`, [req.params.reference]);
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (error) { console.error(error); res.status(500).json({ error: 'Unable to load order' }); }
});

if (isLocal) {
  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => console.log(`Skincare With Happy API running on port ${port}`));
}

module.exports = app;
