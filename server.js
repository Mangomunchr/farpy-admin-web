import express from 'express';

const app = express();
app.use(express.json());
const PORT = 4000;
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!ADMIN_API_TOKEN || token !== ADMIN_API_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.use(express.static('public'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(path, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    ...(init.headers || {}),
  };
  const r = await fetch(url, { ...init, headers });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return r;
}

app.get('/api/jobs', requireAdmin, async (req, res) => {
  try {
    const r = await sb('jobs?select=public_id,status,created_at,updated_at&order=created_at.desc&limit=20');
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/security', requireAdmin, async (req, res) => {
  try {
    const r = await sb('security_events?select=public_id,kind,created_at&order=created_at.desc&limit=20');
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/diag/bunny', requireAdmin, async (req, res) => {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const host = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';
  const key = process.env.BUNNY_API_KEY;
  if (!zone || !host || !key) {
    return res.status(400).json({ error: 'missing bunny env' });
  }

  const path = `diag/${Date.now()}-ok.txt`;
  const url = `https://${host}/${zone}/${path}`;
  try {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'AccessKey': key, 'Content-Type': 'application/octet-stream' },
      body: `ok ${new Date().toISOString()}`
    });
    const ok = [200, 201, 204].includes(r.status);
    res.status(ok ? 200 : 500).json({ status: r.status, path, ok });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`[farpy-web] listening :${PORT}`));
