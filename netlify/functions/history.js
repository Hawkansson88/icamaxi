// Netlify Function: history.js
// Hämtar veckoproduktion från Sigenergy Historical Data API
// GET /.netlify/functions/history → returnerar 7 dagars produktionsdata

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

    // Hämta dagens datum för Week-anrop
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // yyyy-MM-dd

    const url = `${BASE}/openapi/systems/${SIGEN_SYSTEM_ID}/history?level=Week&date=${date}`;
    const r = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await r.json();
    if (data.code !== 0) throw new Error(`API error: ${data.msg}`);

    // Extrahera dagliga produktionsvärden från itemList
    const raw = data.data;
    const items = raw.itemList || [];

    // Gruppera per dag och summera powerGeneration
    const dayMap = {};
    items.forEach(item => {
      const day = item.dataTime ? item.dataTime.split(' ')[0] : null;
      if (!day) return;
      if (!dayMap[day]) dayMap[day] = 0;
      dayMap[day] += (item.powerGeneration || 0);
    });

    // Sortera dagar och bygg array
    const days = Object.keys(dayMap).sort();
    const values = days.map(d => parseFloat(dayMap[d].toFixed(1)));

    // Svenska dagnamn
    const svDay = ['Sön','Mån','Tis','Ons','Tor','Fre','Lör'];
    const labels = days.map(d => svDay[new Date(d).getDay()]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ labels, values, raw: dayMap })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ demo: true, reason: err.message })
    };
  }
};
