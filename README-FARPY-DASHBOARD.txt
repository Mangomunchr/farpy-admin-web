FARPY ADMIN-WEB DASHBOARD PATCH
================================

What this is
------------
A small drop-in for your existing admin-web that adds:
- /dashboard                 → live view for Farpy users + NodeMunchers
- /api/ingest (POST)         → write telemetry events
- /api/events (GET)          → list recent events with filters
- /api/summary (GET)         → quick KPIs for dashboard cards
- /l/<token>                 → already present short link redirect (kept)

How to install
--------------
1) Unzip this into your existing admin-web so files land like:
   admin-web/
     server.js            (overwrite)
     public/dashboard.html
     public/dashboard.css
     public/dashboard.js
     data/                (auto-created at runtime)

2) Ensure your .env has (sample values):
   ADMIN_API_TOKEN=__REDACTED__
   LINK_SIGNING_SECRET=replace-with-36+chars-random
   BUNNY_PULL_BASE=https://cdn.farpy.com
   PUBLIC_BASE=http://localhost:4000

3) Run it:
   npm i
   node server.js
   Open http://localhost:4000/dashboard
   (enter the same ADMIN_API_TOKEN when prompted)

Ingest examples
---------------
PowerShell:

$headers = @{ "x-admin-token" = "YOUR_ADMIN_TOKEN" }
$ev = @{ type="render_stage"; actor="farpy_user"; userId="164897..."; jobId="abc123"; stage="queued"; status="ok"; bytes=12345; note="scene.zip" } | ConvertTo-Json -Compress
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:4000/api/ingest" -Headers $headers -ContentType "application/json" -Body $ev

Node (bots):

await fetch('http://admin-host:4000/api/ingest', {
  method:'POST',
  headers:{ 'x-admin-token': process.env.ADMIN_API_TOKEN, 'content-type':'application/json' },
  body: JSON.stringify({
    type:'render_stage', actor:'farpy_user', userId:discordId, jobId:publicId, stage:'queued', status:'ok', bytes:fileBytes.length, note:'uploaded'
  })
});

Security notes
--------------
- All endpoints require ADMIN_API_TOKEN (sent either as 'x-admin-token' header or 'Authorization: Bearer ...').
- Events are stored as JSONL in ./data/events.jsonl (local only). No PII beyond the IDs you choose to send.
- Rotate ADMIN_API_TOKEN periodically; set DEBUG=1 for startup diagnostics.

Enjoy!  — 2025-08-15T12:04:11.998946Z
