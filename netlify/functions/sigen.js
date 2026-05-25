const SIGEN_USERNAME = process.env.SIGEN_USERNAME;
const SIGEN_PASSWORD = process.env.SIGEN_PASSWORD;
const SIGEN_SYSTEM_ID = process.env.SIGEN_SYSTEM_ID;
const BASE = 'https://api.sigencloud.com';

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  console.log('AUTH ATTEMPT username:', SIGEN_USERNAME);
  console.log('AUTH ATTEMPT password length:', SIGEN_PASSWORD ? SIGEN_PASSWORD.length : 'MISSING');

  const r = await fetch(`${BASE}/openapi/auth/login/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: SIGEN_USERNAME, password: SIGEN_PASSWORD })
  });

  const text = await r.text();
  console.log('SIGEN AUTH RESPONSE:', text);

  const data = JSON.parse(text);
  if (data.code !== 0) throw new Error(`Auth failed: ${data.msg} | raw: ${text}`);

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
    const r = await fetch(`${BASE}/openapi/systems/${SIGEN_SYSTEM_ID}/summary`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await r.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ demo: true, reason: err.message }) };
  }
};
