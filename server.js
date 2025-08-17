import express from 'express';
import crypto from 'crypto';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors());

const PORT = process.env.PORT || 4000;
const ADMIN_API_TOKEN   = process.env.ADMIN_API_TOKEN || '';
const LINK_SIGNING_SECRET = process.env.LINK_SIGNING_SECRET || '';
const BUNNY_PULL_BASE   = (process.env.BUNNY_PULL_BASE || '').replace(/\/+$/,'');
const PUBLIC_BASE       = (process.env.PUBLIC_BASE || `http://localhost:${PORT}`).replace(/\/+$/,'');

// simple debug
if (process.env.DEBUG) {
  console.log('[debug] ADMIN_API_TOKEN len =', ADMIN_API_TOKEN.length);
  console.log('[debug] LINK_SIGNING_SECRET len =', LINK_SIGNING_SECRET.length);
  console.log('[debug] BUNNY_PULL_BASE =', BUNNY_PULL_BASE);
  console.log('[debug] PUBLIC_BASE =', PUBLIC_BASE);
}

// --- auth middleware for admin API ---
function reqAdmin(req,res,next){
  const hdr = req.headers['x-admin-token'] || (req.headers['authorization']||'').replace(/^Bearer\s+/i,'');
  if (!ADMIN_API_TOKEN || hdr !== ADMIN_API_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// --- link signing helpers (HMAC) ---
const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const sign = payload => b64url(crypto.createHmac('sha256', LINK_SIGNING_SECRET).update(payload).digest());
const now  = () => Math.floor(Date.now()/1000);

// --- short link API ---
app.post('/api/links', reqAdmin, (req,res)=>{
  const { path, expiresIn = 600 } = req.body || {};
  if (!LINK_SIGNING_SECRET) return res.status(500).json({ error:'LINK_SIGNING_SECRET missing' });
  if (!BUNNY_PULL_BASE)     return res.status(500).json({ error:'BUNNY_PULL_BASE missing' });
  if (!path)                return res.status(400).json({ error:'path required' });

  const exp = now() + Math.max(60, Math.min(86400, Number(expiresIn)||600));
  const payload = b64url(JSON.stringify({ p:path, e:exp }));
  const sig = sign(payload);

  res.json({
    shortUrl: `${PUBLIC_BASE}/l/${payload}.${sig}`,
    target:   `${BUNNY_PULL_BASE}/${path}`.replace(/([^:]\/)\/+/, '$1'),
    exp
  });
});

// --- short link resolver ---
app.get('/l/:token', (req,res)=>{
  const m = (req.params.token || '').match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return res.status(400).send('Bad token');
  const [_, payload, sig] = m;
  if (sig !== sign(payload)) return res.status(401).send('Invalid signature');

  let data;
  try { data = JSON.parse(Buffer.from(payload.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString()); }
  catch { return res.status(400).send('Bad payload'); }

  if (!data || !data.p || !data.e) return res.status(400).send('Bad payload');
  if (now() > data.e) return res.status(410).send('Link expired');

  const target = `${BUNNY_PULL_BASE}/${data.p}`.replace(/([^:]\/)\/+/, '$1');
  res.redirect(302, target);
});

// --- in-memory job status store (for tracker demo) ---
const statusStore = new Map(); // jobId -> { events:[...], updatedAt }

app.post('/api/ingest', reqAdmin, (req,res)=>{
  const { jobId, userId, actor, type, stage, status, note, bytes } = req.body || {};
  if (!jobId) return res.status(400).json({ error:'jobId required' });
  const ev = {
    ts: new Date().toISOString(),
    jobId, userId: userId || null, actor: actor || 'system',
    type: type || 'render_stage',
    stage: stage || 'queued', status: status || 'ok',
    note:  note || '', bytes: Number(bytes)||0
  };
  const cur = statusStore.get(jobId) || { events:[], updatedAt:null };
  cur.events.push(ev);
  cur.updatedAt = Date.now();
  statusStore.set(jobId, cur);
  res.json({ ok:true });
});

app.get('/api/status/:jobId', (req,res)=>{
  const rec = statusStore.get(req.params.jobId);
  res.json({ jobId: req.params.jobId, events: rec?.events || [] });
});

// very tiny tracker page
app.get('/t/:jobId', (req,res)=>{
  const jobId = req.params.jobId;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Farpy Tracker · ${jobId}</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;margin:20px;line-height:1.4}
  .card{max-width:800px;margin:auto;padding:16px;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .row{display:flex;gap:10px;align-items:center;border-bottom:1px dashed #eee;padding:8px 0}
  .dot{width:10px;height:10px;border-radius:50%;background:#999}
  .ok .dot{background:#10b981}
  .err .dot{background:#ef4444}
  code{background:#f6f7f8;padding:2px 6px;border-radius:6px}
  small{color:#6b7280}
</style>
</head>
<body>
<div class="card">
  <h2>Job <code>${jobId}</code></h2>
  <div id="list"></div>
  <small>Auto-refreshing…</small>
</div>
<script>
const jobId = ${JSON.stringify(jobId)};
const list = document.getElementById('list');
async function tick(){
  const r = await fetch('/api/status/'+jobId);
  const j = await r.json();
  list.innerHTML = (j.events||[]).map(ev=>{
    const cls = (ev.status||'').toLowerCase()==='ok' ? 'ok' : 'err';
    return '<div class="row '+cls+'"><div class="dot"></div><div><div><b>'+ev.stage+'</b> — '+(ev.note||'')+'</div><small>'+ev.ts+' · '+(ev.actor||'')+'</small></div></div>';
  }).join('') || '<div class="row"><div class="dot"></div><div>No events yet…</div></div>';
}
tick(); setInterval(tick, 2500);
</script>
</body></html>`);
});

app.get('/health',(_,res)=>res.json({ ok:true }));
app.listen(PORT, ()=>console.log(`[farpy-web] listening :${PORT}`));
