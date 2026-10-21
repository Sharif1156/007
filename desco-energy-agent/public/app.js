/* DESCO Energy Agent — Frontend */
const API = window.location.origin; // same-origin backend
let token = null;

// DOM
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginAlert = document.getElementById('login-alert');
const modePill = document.getElementById('mode-pill');

// utils
const bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const fmtMoney = (n) => bn(n.toFixed(2));
const fmtInt = (n) => bn(Math.round(n));
const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('bn-BD', { day: '2-digit', month: 'short', year: 'numeric' });
};

function showAlert(el, msg, kind = 'error') {
  el.style.display = 'block';
  el.textContent = msg;
  el.className = `alert ${kind}`;
  if (kind === 'success') {
    el.style.background = '#dcfce7';
    el.style.color = '#166534';
    el.style.borderColor = '#bbf7d0';
  }
}

// ---------- Charts (Canvas, no external lib) ----------
function drawSpark(canvas, values, { color = '#0f6ff5', fill = 'rgba(15,111,245,0.12)' } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth || 300;
  const h = 120;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const pad = 14;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;
  const max = Math.max(...values) || 1;
  const min = Math.min(...values) || 0;

  ctx.clearRect(0, 0, w, h);
  // gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, fill);
  grad.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad + (i / (values.length - 1)) * plotW;
    const y = pad + plotH - ((v - min) / (max - min || 1)) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(w - pad, pad + plotH);
  ctx.lineTo(pad, pad + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad + (i / (values.length - 1)) * plotW;
    const y = pad + plotH - ((v - min) / (max - min || 1)) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // dots
  values.forEach((v, i) => {
    const x = pad + (i / (values.length - 1)) * plotW;
    const y = pad + plotH - ((v - min) / (max - min || 1)) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

function drawMonthChart(canvas, days) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth || 700;
  const h = 200;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const pad = { t: 24, r: 20, b: 34, l: 40 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const values = days.map(d => d.consumption);
  const max = Math.max(...values) || 1;

  ctx.clearRect(0, 0, w, h);
  ctx.font = '12px Inter, Noto Bangla';
  ctx.fillStyle = '#6b7280';
  ctx.textBaseline = 'middle';

  // grid lines + labels
  for (let k = 0; k <= 4; k++) {
    const y = pad.t + plotH - (k / 4) * plotH;
    const val = (max * k / 4);
    ctx.fillText(bn(val.toFixed(0)), 4, y + 4);
    ctx.beginPath();
    ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y);
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1; ctx.stroke();
  }

  // area
  ctx.beginPath();
  days.forEach((d, i) => {
    const x = pad.l + (i / (days.length - 1)) * plotW;
    const y = pad.t + plotH - (d.consumption / max) * plotH;
    if (i === 0) ctx.moveTo(x, h - pad.b); ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.l + plotW, h - pad.b);
  ctx.closePath();
  ctx.fillStyle = 'rgba(15,111,245,0.10)';
  ctx.fill();

  // line
  ctx.beginPath();
  days.forEach((d, i) => {
    const x = pad.l + (i / (days.length - 1)) * plotW;
    const y = pad.t + plotH - (d.consumption / max) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#0f6ff5'; ctx.lineWidth = 2; ctx.stroke();

  // x axis labels
  ctx.fillStyle = '#6b7280';
  days.forEach((d, i) => {
    if (i % 5 === 0 || i === days.length - 1) {
      const x = pad.l + (i / (days.length - 1)) * plotW;
      const label = new Date(d.date).toLocaleDateString('bn-BD', { day: '2-digit', month: 'short' });
      ctx.fillText(label, x - 14, h - pad.b + 18);
    }
  });
}

// ---------- Auth ----------
async function login(e) {
  e.preventDefault();
  const fd = new FormData(loginForm);
  const body = {
    consumerNo: fd.get('consumerNo'),
    password: fd.get('password'),
  };
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'লগইন হচ্ছে...';
  try {
    const res = await fetch(`${API}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'লগইন ব্যর্থ হয়েছে');
    token = data.token;
    localStorage.setItem('desco_token', token);
    loadDashboard(data.customer || {});
  } catch (err) {
    showAlert(loginAlert, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'লগইন করুন';
  }
}

// ---------- Dashboard ----------
async function loadDashboard(customer) {
  loginScreen.style.display = 'none';
  dashboard.style.display = 'block';
  if (customer.name) document.querySelector('.header-title').textContent = customer.name;
  modePill.textContent = 'ডেমো মোড চালু আছে';

  try {
    const [bal, cons, hist] = await Promise.all([
      fetchJson('/api/balance'),
      fetchJson('/api/consumption'),
      fetchJson('/api/recharge-history'),
    ]);
    renderBalance(bal);
    renderCharts(cons);
    renderHistory(hist);
    await loadInsights();
  } catch (err) {
    console.error(err);
  }
}

async function fetchJson(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 401) {
      location.reload();
      throw new Error('সেশন মেয়াদSlug');
    }
    throw new Error('ডাটা লোড করতে সমস্যা হচ্ছে');
  }
  return res.json();
}

function renderBalance(bal) {
  document.getElementById('balance').textContent = fmtMoney(bal.balance || 0);
  document.getElementById('units').textContent = fmtInt(bal.units || 0);
  document.getElementById('unit-price').textContent = bn((bal.unitPrice || 2.35).toFixed(2));
}

function renderCharts(cons) {
  const days = cons.daily || [];
  const todayValues = days.slice(-24).map((_, i) => {
    // approximate hourly from daily value
    const base = (days[days.length - 1] || { consumption: 0 }).consumption;
    return Math.max(0, base * (0.4 + 0.6 * Math.abs(Math.sin(i / 3))));
  });
  drawSpark(document.getElementById('todayChart'), todayValues);
  document.getElementById('today-stat').textContent = fmtInt((days[days.length - 1] || { consumption: 0 }).consumption) + ' ইউনিট';

  const monthCanvas = document.getElementById('monthChart');
  drawMonthChart(monthCanvas, days);
  window.addEventListener('resize', () => drawMonthChart(monthCanvas, days));
}

function renderHistory(hist) {
  const body = document.getElementById('history-body');
  const items = (hist.history || []).slice(0, 10);
  body.innerHTML = items.map(tx => `
    <tr>
      <td>${fmtDate(tx.date)}</td>
      <td>৳${fmtMoney(tx.amount)}</td>
      <td>${fmtInt(tx.units)}</td>
      <td><span class="ok">${tx.status || 'সফল'}</span></td>
      <td style="font-size:12px; font-family:Inter, monospace;">${tx.txnId || '-'}</td>
    </tr>
  `).join('');
}

async function loadInsights() {
  try {
    const data = await fetchJson('/api/ai-insights');
    const box = document.getElementById('ai-insights');
    box.innerHTML = data.insights.map(ins => `
      <div class="insight ${ins.type}">
        <span class="t">${ins.title}</span>
        ${ins.text}
        <span class="a">${ins.action ? '➤ ' + ins.action : ''}</span>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

// ---------- Recharge ----------
document.getElementById('recharge-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = document.getElementById('recharge-btn');
  const out = document.getElementById('recharge-result');
  btn.disabled = true; btn.textContent = 'প্রসেস করা হচ্ছে...';
  out.textContent = '';
  try {
    const res = await fetch(`${API}/api/recharge`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount: Number(fd.get('amount')), method: fd.get('method') }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'রিচার্জ ব্যর্থ');
    out.style.color = '#10b981';
    out.textContent = `সফল! নতুন ব্যালেন্স: ৳${fmtMoney(data.newBalance)} | নতুন ইউনিট: ${fmtInt(data.newUnits)}`;
    e.target.reset();
    // refresh balance
    const bal = await fetchJson('/api/balance');
    renderBalance(bal);
  } catch (err) {
    out.style.color = '#ef4444';
    out.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'রিচার্জ করুন';
  }
});

// ---------- Logout ----------
document.getElementById('logout-btn').addEventListener('click', () => {
  token = null;
  localStorage.removeItem('desco_token');
  location.reload();
});

// ---------- Boot ----------
loginForm.addEventListener('submit', login);
const saved = localStorage.getItem('desco_token');
if (saved) {
  token = saved;
  loadDashboard({});
}
