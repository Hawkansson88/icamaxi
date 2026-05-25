const SIGEN_USERNAME = process.env.SIGEN_USERNAME;
const SIGEN_PASSWORD = process.env.SIGEN_PASSWORD;
const SIGEN_SYSTEM_ID = process.env.SIGEN_SYSTEM_ID;
const BASE = 'https://api.sigencloud.com';

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const r = await fetch(`${BASE}/openapi/auth/login/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: SIGEN_USERNAME, password: SIGEN_PASSWORD })
  });
  const data = await r.json();
  if (data.code !== 0) throw new Error(`Auth failed: ${data.msg}`);
  const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
  cachedToken = parsed.accessToken;
  tokenExpiry = Date.now() + (parsed.expiresIn - 300) * 1000;
  return cachedToken;
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

exports.handler = async () => {
  if (!SIGEN_USERNAME || !SIGEN_PASSWORD || !SIGEN_SYSTEM_ID) {
    return { statusCode: 200, headers, body: JSON.stringify({ demo: true }) };
  }

  try {
    const token = await getToken();
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const url = `${BASE}/openapi/systems/${SIGEN_SYSTEM_ID}/history?level=Month&date=${date}`;

    console.log('HISTORY URL:', url);

    const r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('HISTORY STATUS:', r.status);
    const text = await r.text();
    console.log('HISTORY RESPONSE:', text.substring(0, 500));

const data = JSON.parse(text);
    if (data.code !== 0) throw new Error(`API error: ${data.msg}`);

    // data.data är en JSON-sträng — parsa den
    const raw = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
    const items = raw.itemList || [];
    console.log('ITEMS COUNT:', items.length);

    const dayMap = {};
    items.forEach(item => {
      if (!item.dataTime) return;
      // Format: "20260525 00:00" → "2026-05-25"
      const dt = item.dataTime.split(' ')[0];
      const day = dt.slice(0,4) + '-' + dt.slice(4,6) + '-' + dt.slice(6,8);
      const val = item.powerGeneration || 0;
      if (val > 0) dayMap[day] = val;
    });

    const days = Object.keys(dayMap).sort();
    const values = days.map(d => parseFloat(dayMap[d].toFixed(1)));
    const svDay = ['Sön','Mån','Tis','Ons','Tor','Fre','Lör'];
    const labels = days.map(d => svDay[new Date(d).getDay()]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ labels, values, raw: dayMap })
    };

  } catch (err) {
    console.log('HISTORY ERROR:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ demo: true, reason: err.message })
    };
  }
};
