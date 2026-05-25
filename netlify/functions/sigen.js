// Netlify Function: sigen.js
// Hämtar summary (statistik) + energyFlow (live kW) från Sigenergy
// Ett auth-anrop, två datahämtningar — returnerar båda samlat

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
    return { statusCode: 200, headers, body: JSON.stringify({ demo: true, reason: 'missing env vars' }) };
  }

  try {
    const token = await getToken();
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

// Hämta summary först, sedan energyFlow
    const summaryRes = await fetch(`${BASE}/openapi/systems/${SIGEN_SYSTEM_ID}/summary`, { headers: authHeaders });
    await new Promise(r => setTimeout(r, 1000));
    const flowRes = await fetch(`${BASE}/openapi/systems/${SIGEN_SYSTEM_ID}/energyFlow`, { headers: authHeaders });

    const summaryJson = await summaryRes.json();
    const flowJson    = await flowRes.json();

    const summary = summaryJson.code === 0
      ? (typeof summaryJson.data === 'string' ? JSON.parse(summaryJson.data) : summaryJson.data)
      : null;

    const flow = flowJson.code === 0
      ? (typeof flowJson.data === 'string' ? JSON.parse(flowJson.data) : flowJson.data)
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ summary, flow })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ demo: true, reason: err.message })
    };
  }
};
