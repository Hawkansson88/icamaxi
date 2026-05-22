const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SIGEN_USERNAME = process.env.SIGEN_USERNAME;
const SIGEN_PASSWORD = process.env.SIGEN_PASSWORD;
const SIGEN_SYSTEM_ID = process.env.SIGEN_SYSTEM_ID;
const BASE = 'https://api.sigencloud.com/openapi/v1';

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const r = await fetch(`${BASE}/oauth/token`, {
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
    const r = await fetch(`${BASE}/system/realtime?systemId=${SIGEN_SYSTEM_ID}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
  }
};
