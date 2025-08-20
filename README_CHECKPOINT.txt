Farpy • admin-web checkpoint
===================================

Where to copy:
  - Copy everything inside this zip into:
    C:\Users\danki\farpy_live\admin-web\  (accept overwrite)

Included:
  - server.js
  - .env.example
  - package.json
  - README_CHECKPOINT.txt

After copying:
  PS> cd C:\Users\danki\farpy_live\admin-web
  PS> npm install
  PS> $env:DEBUG = "1"
  PS> node server.js

Health:
  PS> curl.exe -s http://127.0.0.1:4000/health

Create short link (10m):
  $H = @{ "x-admin-token" = "<ADMIN_API_TOKEN>" }
  $B = @{ path = "diag/hello.txt"; expiresIn = 600 } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:4000/api/links" -Headers $H -ContentType "application/json" -Body $B

Notes:
  - LINK_SIGNING_SECRET and ADMIN_API_TOKEN must match Render.
  - BUNNY_PULL_BASE should be https://cdn.farpy.com.
