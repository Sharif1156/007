require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Demo mode: ON by default so the app works immediately without real DESCO credentials.
// Set DEMO_MODE=false and fill in REAL_*_ENDPOINT in .env to connect to the live DESCO portal.
const DEMO_MODE = process.env.DEMO_MODE !== 'false';

// ---------------------------------------------------------------------------
// DESCO Prepaid API Client
// ---------------------------------------------------------------------------
//
// NOTE: I cannot access https://prepaid.desco.org.bd from this sandbox, so the
// real endpoint URLs below are placeholders. You must discover the real endpoints
// from the portal's Network tab (DevTools) and put them in .env.
//
// See README.md for the discovery steps.
class DESCOApiClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.DESCO_BASE_URL || 'https://prepaid.desco.org.bd';
    this.loginEndpoint = options.loginEndpoint || process.env.REAL_LOGIN_ENDPOINT || '/api/customer-login';
    this.balanceEndpoint = options.balanceEndpoint || process.env.REAL_BALANCE_ENDPOINT || '/api/meter-balance';
    this.consumptionEndpoint = options.consumptionEndpoint || process.env.REAL_CONSUMPTION_ENDPOINT || '/api/consumption';
    this.rechargeEndpoint = options.rechargeEndpoint || process.env.REAL_RECHARGE_ENDPOINT || '/api/recharge';
    this.historyEndpoint = options.historyEndpoint || process.env.REAL_HISTORY_ENDPOINT || '/api/recharge-history';
    this.token = null;
    this.customer = null;
  }

  async _request(endpoint, { method = 'GET', body, headers = {} } = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers,
    };
    if (this.token) reqHeaders['Authorization'] = `Bearer ${this.token}`;
    const init = { method, headers: reqHeaders };
    if (body) init.body = JSON.stringify(body);
    const res = await fetch(url, init);
    let data;
    try { data = await res.json(); } catch (_) { data = { raw: await res.text() }; }
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  async login(credentials) {
    // DESCO login typically needs consumer number + password / mobile + OTP.
    const data = await this._request(this.loginEndpoint, {
      method: 'POST',
      body: { username: credentials.consumerNo || credentials.mobile, password: credentials.password },
    });
    if (data.token) this.token = data.token;
    if (data.customer) this.customer = data.customer;
    return data;
  }

  async getMeter() {
    return this._request(this.balanceEndpoint); // meter info usually bundled with balance
  }

  async getBalance() {
    return this._request(this.balanceEndpoint);
  }

  async getConsumption(params = {}) {
    return this._request(`${this.consumptionEndpoint}?${new URLSearchParams(params)}`);
  }

  async getRechargeHistory(params = {}) {
    return this._request(`${this.historyEndpoint}?${new URLSearchParams(params)}`);
  }

  async recharge(payload) {
    return this._request(this.rechargeEndpoint, { method: 'POST', body: payload });
  }
}

// ---------------------------------------------------------------------------
// Mock / demo data generator (works without any real DESCO API access)
// ---------------------------------------------------------------------------
const now = () => new Date();
const formatBDT = (n) => `৳${n.toFixed(2)}`;

function generateDemoData() {
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const days = [];
  let cumulative = 45;
  for (let i = 0; i <= 29; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const daily = Math.round((2.5 + Math.sin(i / 4) * 1.8 + Math.random() * 1.2) * 10) / 10;
    cumulative += daily;
    days.push({
      date: d.toISOString().slice(0, 10),
      consumption: daily,
      cumulative: Math.round(cumulative * 10) / 10,
    });
  }

  const balance = Math.round((85 + Math.random() * 120) * 100) / 100;
  const unitsPerTaka = 2.35;
  const units = Math.round(balance * unitsPerTaka);

  const history = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i * 3 - 1);
    const amt = [50, 100, 200, 100, 50, 200, 100, 50][i];
    history.push({
      date: d.toISOString().slice(0, 10),
      amount: amt,
      units: Math.round(amt * unitsPerTaka),
      status: 'Success',
      txnId: 'DESCO' + Math.floor(100000 + Math.random() * 900000),
    });
  }

  return {
    customer: {
      name: 'মোঃ রাহিম উদ্দিন',
      consumerNo: 'DESCO-2024-8841',
      meterNo: 'M-8841-92',
      division: 'DESCO Gulshan Division',
      tariff: 'Prepaid (Agricultural/Residential)',
    },
    meter: {
      meterNo: 'M-8841-92',
      status: 'Active',
      voltage: 230,
      load: '1.5 kW',
      lastReading: Math.round((12450 + Math.random() * 200) * 10) / 10,
    },
    balance,
    units,
    unitPrice: unitsPerTaka,
    daily: days,
    history,
    updatedAt: new Date().toISOString(),
  };
}

const demo = generateDemoData();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Demo-mode login accepts anything; real mode forwards to DESCO.
app.post('/api/login', async (req, res) => {
  const { consumerNo, mobile, password } = req.body;
  if (!consumerNo && !mobile) {
    return res.status(400).json({ error: 'Consumer number or mobile required' });
  }
  if (DEMO_MODE) {
    return res.json({
      success: true,
      token: 'demo-token-' + Math.random().toString(36).slice(2),
      customer: demo.customer,
      message: 'Demo mode: logged in with simulated DESCO data.',
    });
  }
  try {
    const client = new DESCOApiClient();
    const data = await client.login({ consumerNo, mobile, password });
    res.json({ success: true, token: client.token, customer: data.customer });
  } catch (err) {
    res.status(401).json({ error: err.message || 'Login failed' });
  }
});

// Auth middleware for demo (just requires a token header)
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

app.get('/api/meter', requireAuth, async (req, res) => {
  if (DEMO_MODE) return res.json(demo.meter);
  try {
    const client = new DESCOApiClient();
    client.token = req.headers.authorization.split(' ')[1];
    res.json(await client.getMeter());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/balance', requireAuth, async (req, res) => {
  if (DEMO_MODE) {
    return res.json({
      balance: demo.balance,
      units: demo.units,
      unitPrice: demo.unitPrice,
      currency: 'BDT',
      updatedAt: demo.updatedAt,
    });
  }
  try {
    const client = new DESCOApiClient();
    client.token = req.headers.authorization.split(' ')[1];
    res.json(await client.getBalance());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/consumption', requireAuth, async (req, res) => {
  if (DEMO_MODE) return res.json({ daily: demo.daily, total: demo.daily.reduce((s, d) => s + d.consumption, 0) });
  try {
    const client = new DESCOApiClient();
    client.token = req.headers.authorization.split(' ')[1];
    res.json(await client.getConsumption(req.query));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/recharge-history', requireAuth, async (req, res) => {
  if (DEMO_MODE) return res.json({ history: demo.history });
  try {
    const client = new DESCOApiClient();
    client.token = req.headers.authorization.split(' ')[1];
    res.json(await client.getRechargeHistory(req.query));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/recharge', requireAuth, async (req, res) => {
  const { amount, method } = req.body;
  if (!amount) return res.status(400).json({ error: 'Amount required' });
  if (DEMO_MODE) {
    const txn = {
      date: new Date().toISOString().slice(0, 10),
      amount: Number(amount),
      units: Math.round(Number(amount) * demo.unitPrice),
      status: 'Success',
      txnId: 'DESCO' + Math.floor(100000 + Math.random() * 900000),
    };
    demo.history.unshift(txn);
    demo.balance += Number(amount);
    demo.units += txn.units;
    return res.json({ success: true, transaction: txn, newBalance: demo.balance, newUnits: demo.units });
  }
  try {
    const client = new DESCOApiClient();
    client.token = req.headers.authorization.split(' ')[1];
    const data = await client.recharge({ amount, method });
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Rule-based "AI" insights: analyzes usage and suggests savings.
app.get('/api/ai-insights', requireAuth, async (req, res) => {
  const daily = DEMO_MODE ? demo.daily : [];
  const insights = [];
  if (daily.length) {
    const avg = daily.reduce((s, d) => s + d.consumption, 0) / daily.length;
    const last = daily[daily.length - 1].consumption;
    const peak = daily.reduce((m, d) => (d.consumption > m.consumption ? d : m), daily[0]);
    if (last > avg * 1.3) {
      insights.push({
        type: 'warning',
        title: 'আজ ব্যবহার সাধারণের চেয়ে বেশি',
        text: `আজ আপনি ${last.toFixed(1)} ইউনিট ব্যবহার করেছেন, যা গড়(${avg.toFixed(1)} ইউনিট) এর চেয়ে বেশি। অজান্তে কোনো সরঞ্জাম চালু আছে কিনা যাচাই করুন।`,
        action: 'অনাবশ্যক লাইট ও ফ্যান বন্ধ করুন',
      });
    } else if (last < avg * 0.7) {
      insights.push({
        type: 'success',
        title: 'সঠিক পথে আছেন',
        text: `আজকের ব্যবহার ${last.toFixed(1)} ইউনিট, গড়ের চেয়ে কম। এভাবে চলে গেলে ব্যালেন্স দীর্ঘদিন টেকবে।`,
        action: 'এই অভ্যাস ধরে রাখুন',
      });
    }
    insights.push({
      type: 'info',
      title: 'সর্বোচ্চ ব্যবহার দিন',
      text: `সর্বোচ্চ ব্যবহার ছিল ${peak.date}`,
    });
  }
  insights.push({
    type: 'tip',
    title: 'বিল কমায়ের টিপস',
    text: 'একটি ১.৫ টন এসি تقریباً ১.২-১.৫ কিলোওয়াট ঘন্টা ব্যবহার করে। তাপমাত্রা ২৪-২৫ ডিগ্রিতে রাখলে বিদ্যুতের সাশ্রয় হয়।',
    action: 'এসি তাপমাত্রা ২৫°C-এ সেট করুন',
  });
  res.json({ insights, generatedAt: new Date().toISOString(), mode: DEMO_MODE ? 'demo' : 'live' });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', mode: DEMO_MODE ? 'demo' : 'live' }));

app.listen(PORT, () => {
  console.log(`DESCO Energy Agent running on http://localhost:${PORT}`);
  console.log(`Mode: ${DEMO_MODE ? 'DEMO (simulated data)' : 'LIVE (real DESCO APIs)'}`);
});

module.exports = app;
