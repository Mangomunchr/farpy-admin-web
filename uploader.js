// Farpy unified Bunny uploader (drop-in)
// Uses the *Storage Zone Password* (Bunny → Storage → <your zone> → FTP & API Access → Password)
// Do NOT use the account-level API key for storage uploads.

import crypto from 'node:crypto';
import https from 'node:https';

const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;           // e.g. "farpy-payloads"
const BUNNY_STORAGE_PASSWORD = process.env.BUNNY_STORAGE_PASSWORD;   // exact storage-zone password
const BUNNY_UPLOAD_PREFIX = process.env.BUNNY_UPLOAD_PREFIX || 'jobs/';
const BUNNY_SIGNING_KEY = process.env.BUNNY_SIGNING_KEY || null;     // for CDN signed links (optional)
const SIGNED_URL_EXPIRY = parseInt(process.env.SIGNED_URL_EXPIRY || '300', 10);

function req(method, path, body, contentType='application/octet-stream') {
  return new Promise((resolve, reject) => {
    if (!BUNNY_STORAGE_ZONE) return reject(new Error('Missing env BUNNY_STORAGE_ZONE'));
    if (!BUNNY_STORAGE_PASSWORD) return reject(new Error('Missing env BUNNY_STORAGE_PASSWORD'));
    const options = {
      hostname: BUNNY_STORAGE_HOST,
      method,
      path: `/${encodeURIComponent(BUNNY_STORAGE_ZONE)}/${path}`,
      headers: {
        'AccessKey': BUNNY_STORAGE_PASSWORD,
        'Content-Type': contentType,
        'Content-Length': body ? Buffer.byteLength(body) : 0
      }
    };
    const r = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const ok = res.statusCode && (res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 204);
        if (!ok) {
          return reject(new Error(`bunny_http_${res.statusCode||'???'}: ${buf.toString('utf8')}`));
        }
        resolve({status: res.statusCode, body: buf});
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

// Public: upload bytes to Bunny Storage under a given objectPath (relative to zone)
export async function bunnyPut(objectPath, bytes, contentType='application/octet-stream') {
  const clean = objectPath.replace(/^\/+/, '');
  return await req('PUT', clean, bytes, contentType);
}

// Optional helper to make a signed CDN URL (if you serve from a pull zone that uses the signing key)
export function makeSignedUrl(baseUrl, filePath, ttlSeconds = SIGNED_URL_EXPIRY) {
  if (!BUNNY_SIGNING_KEY) throw new Error('No BUNNY_SIGNING_KEY configured');
  const expires = Math.floor(Date.now()/1000) + ttlSeconds;
  const tokenInput = BUNNY_SIGNING_KEY + filePath + expires;
  const token = crypto.createHash('md5').update(tokenInput).digest('hex');
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${filePath}${sep}token=${token}&expires=${expires}`;
}

// Tiny smoke test when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      const path = `${BUNNY_UPLOAD_PREFIX}${ts}.txt`;
      const msg = `hello from farpy ${ts}`;
      const res = await bunnyPut(path, Buffer.from(msg, 'utf8'), 'text/plain');
      console.log(`[uploader] PUT ${path} -> ${res.status}`);
    } catch (e) {
      console.error('[uploader] error', e.message);
      process.exit(1);
    }
  })();
}
