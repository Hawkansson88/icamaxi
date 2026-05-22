// Netlify Function: telemetry.js
// Tar emot push-data från Sigenergy och sparar senaste värden i Supabase.
// Sigenergy konfigureras att POST:a hit: https://icamaxi.netlify.app/.netlify/functions/telemetry
// GET returnerar senaste telemetri-raden (för dashboarden).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

async function getLatest() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/telemetry?order=inserted_at.desc&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    }
  );
  const rows = await r.json();
  return rows[0] || null;
}

async function insertRow(payload) {
  // Sigenergy skickar en array — ta första system-raden
  const item = Array.isArray(payload)
    ? payload.find(p => p.deviceType === 'system') || payload[0]
    : payload;

  const v = item.value || {};

  const row = {
    system_id: item.systemId || item.snCode || null,
    statistics_time: item.statisticsTime || null,
    pv_power_w: parseFloat(v['pvPowerW'] || 0),
    grid_active_power_w: parseFloat(v['gridActivePowerW'] || 0),
    storage_soc: parseFloat(v['storageSOC%'] || 0),
    storage_charge_discharge_w: parseFloat(v['storageChargeDischargePowerW'] || 0),
    inverter_active_power_w: parseFloat(v['inverterActivePowerW'] || 0),
    raw: item
  };

  const r = await fetch(`${SUPABASE_URL}/rest/v1/telemetry`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(row)
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Supabase insert failed: ${err}`);
  }
}

exports.handler = async (event) => {
  // GET → returnera senaste telemetri till dashboarden
  if (event.httpMethod === 'GET') {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return { statusCode: 200, headers, body: JSON.stringify({ demo: true }) };
    }
    try {
      const row = await getLatest();
      return { statusCode: 200, headers, body: JSON.stringify(row || { demo: true }) };
    } catch (err) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // POST → ta emot push från Sigenergy, spara i Supabase
  if (event.httpMethod === 'POST') {
    try {
      const payload = JSON.parse(event.body || '[]');
      await insertRow(payload);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
};
