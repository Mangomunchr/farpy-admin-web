import express from "express";
import crypto from "crypto";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import "dotenv/config";

/**
 * Config
 */
const app = express();
const PORT = Number(process.env.PORT || 4000);
const ADMIN_API_TOKEN = (process.env.ADMIN_API_TOKEN || "").trim();
const LINK_SIGNING_SECRET = (process.env.LINK_SIGNING_SECRET || "").trim();
const BUNNY_PULL_BASE = ((process.env.BUNNY_PULL_BASE || "")).replace(/\/+$/, "");
const PUBLIC_BASE = ((process.env.PUBLIC_BASE || `http://localhost:${PORT}`)).replace(/\/+$/, "");

// Fast fail if critical envs missing at boot (Render health check will catch this)
if (!LINK_SIGNING_SECRET) console.warn("[warn] LINK_SIGNING_SECRET is not set");
if (!BUNNY_PULL_BASE) console.warn("[warn] BUNNY_PULL_BASE is not set");

// Trust Render proxy for correct client IPs
app.set("trust proxy", 1);

// Security middleware
app.use(helmet({
  // keep basic defaults; no CSP here because this service is API/redirect only
}));

// Logging (common in prod, tiny in dev)
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// JSON parsing
app.use(express.json({ limit: "2mb" }));

/**
 * CORS
 * - Public redirect route `/l/:token` should be reachable from anywhere (no CORS needed for redirects)
 * - Admin API: lock to same origin by default; allow configurable origin(s) via ADMIN_CORS_ORIGINS (comma-separated)
 */
const adminOrigins = (process.env.ADMIN_CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    cors({
      origin: adminOrigins.length ? adminOrigins : false, // false = no CORS (server-to-server or same-origin)
      methods: ["POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 600
    })(req, res, next);
  } else {
    next();
  }
});

/**
 * Simple constant-time token check
 */
function safeEqual(a = "", b = "") {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function reqAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!ADMIN_API_TOKEN) return res.status(500).json({ error: "ADMIN_API_TOKEN not configured" });
  if (!token || !safeEqual(token, ADMIN_API_TOKEN)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

/**
 * Rate-limit admin API to avoid abuse
 */
const adminLimiter = rateLimit({
  windowMs: 60_000, // 1 min
  max: 60,          // 60 req/min per IP
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Helpers
 */
const now = () => Math.floor(Date.now() / 1000);
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sign = (payloadB64Url) => {
  const h = crypto.createHmac("sha256", LINK_SIGNING_SECRET);
  h.update(payloadB64Url);
  return b64url(h.digest());
};

/**
 * Health
 */
app.get("/health", (req, res) => {
  const ok = Boolean(LINK_SIGNING_SECRET && BUNNY_PULL_BASE);
  res.status(ok ? 200 : 500).json({
    ok,
    version: "1",
    env: {
      port: PORT,
      publicBase: PUBLIC_BASE,
      bunnyBaseSet: Boolean(BUNNY_PULL_BASE),
      signingSet: Boolean(LINK_SIGNING_SECRET)
    }
  });
});

/**
 * Create signed link (admin)
 * Body: { "path": "assets/video.mp4", "expiresIn": 600 } // 60..86400 seconds
 * Returns: { shortUrl: "https://links.farpy.com/l/<payload>.<sig>" }
 */
app.post("/api/links", adminLimiter, reqAdmin, (req, res) => {
  const { path, expiresIn = 600 } = req.body || {};
  if (!LINK_SIGNING_SECRET) return res.status(500).json({ error: "LINK_SIGNING_SECRET missing" });
  if (!BUNNY_PULL_BASE) return res.status(500).json({ error: "BUNNY_PULL_BASE missing" });
  if (!path || typeof path !== "string") return res.status(400).json({ error: "path required" });

  const exp = now() + Math.max(60, Math.min(86400, Number(expiresIn) || 600));
  const payload = b64url(JSON.stringify({ p: path.replace(/^\/+/, ""), e: exp }));
  const sig = sign(payload);

  return res.json({ shortUrl: `${PUBLIC_BASE}/l/${payload}.${sig}` });
});

/**
 * Public redirect
 */
app.get("/l/:token", (req, res) => {
  const token = String(req.params.token || "");
  const m = token.match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return res.status(400).send("Bad token");
  const [, payload, sig] = m;
  const expect = sign(payload);
  if (!safeEqual(sig, expect)) return res.status(401).send("Invalid signature");

  let data;
  try {
    data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return res.status(400).send("Bad payload");
  }
  if (!data || !data.p || !data.e) return res.status(400).send("Bad payload");
  if (now() > data.e) return res.status(410).send("Link expired");

  const target = `${BUNNY_PULL_BASE}/${data.p}`.replace(/([^:]\/)\/+/, "$1");
  return res.redirect(302, target);
});

/**
 * Start
 */
app.listen(PORT, () => {
  console.log(`[farpy-admin-web] listening on :${PORT}`);
});
