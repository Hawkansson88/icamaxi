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
    
    // Hämta denna månad
    const url = `${BASE}/openapi/systems/${SIGEN_SYSTEM_ID}/history?level=Month&date=${date}`;
    const r = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const text = await r.text();
    const data = JSON.parse(text);
    if (data.code !== 0) throw new Error(`API error: ${data.msg}`);
    const raw = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
    const items = raw.itemList || [];

    const dayMap = {};
    items.forEach(item => {
      if (!item.dataTime) return;
      const dt = item.dataTime.split(' ')[0];
      const day = dt.slice(0,4) + '-' + dt.slice(4,6) + '-' + dt.slice(6,8);
      const val = item.powerGeneration || 0;
      if (val > 0) dayMap[day] = val;
    });

    const allDays = Object.keys(dayMap).sort();
    
    // Ta bort idag om dagen inte är slut (före 23:00)
    const todayStr = date;
    const hour = now.getHours();
    const daysToUse = (hour < 23 && allDays[allDays.length-1] === todayStr)
      ? allDays.slice(0, -1)
      : allDays;
    
    // Om vi har färre än 7 dagar denna månad, hämta även förra månaden
    let finalDays = daysToUse;
    if (daysToUse.length < 7) {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const url2 = `${BASE}/openapi/systems/${SIGEN_SYSTEM_ID}/history?level=Month&date=${prevDate}`;
      await new Promise(res => setTimeout(res, 1000));
      const r2 = await fetch(url2, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data2 = await r2.json();
      const raw2 = typeof data2.data === 'string' ? JSON.parse(data2.data) : data2.data;
      const items2 = raw2.itemList || [];
      items2.forEach(item => {
        if (!item.dataTime) return;
        const dt = item.dataTime.split(' ')[0];
        const day = dt.slice(0,4) + '-' + dt.slice(4,6) + '-' + dt.slice(6,8);
        const val = item.powerGeneration || 0;
        if (val > 0) dayMap[day] = val;
      });
      const allDays2 = Object.keys(dayMap).sort();
      finalDays = allDays2.filter(d => d !== todayStr || hour >= 23);
    }

    const last7 = finalDays.slice(-7);
    const values = last7.map(d => parseFloat(dayMap[d].toFixed(1)));
    const svDay = ['Sön','Mån','Tis','Ons','Tor','Fre','Lör'];
    const labels = last7.map(d => svDay[new Date(d).getDay()]);
  } catch (err) {
    console.log('HISTORY ERROR:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ demo: true, reason: err.message })
    };
  }
};
