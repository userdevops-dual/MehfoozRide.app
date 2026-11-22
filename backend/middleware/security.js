// middleware/security.js — request hardening without extra dependencies.
//   securityHeaders  basic HTTP security headers
//   sanitizeInput    strips MongoDB operators ($gt, $where…) and dotted keys from body/query/params
//   rateLimit(opts)  in-memory limiter per IP (+ optional key, e.g. phone). Fine for one
//                    server process; use a shared store (Redis) when running several.
//   hideServerErrors in production, 5xx responses never carry internal error text
//   corsOptions      allowed browser origins from CORS_ORIGINS (mobile apps send no Origin)

const isProd = () => (process.env.NODE_ENV || "").toLowerCase() === "production";

const securityHeaders = (req, res, next) => {
  res.removeHeader("X-Powered-By");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (isProd()) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
};

// Remove keys like "$gt" or "a.b" anywhere in the object (NoSQL injection)
const clean = (v, depth = 0) => {
  if (depth > 10 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(x => clean(x, depth + 1));
  for (const k of Object.keys(v)) {
    if (k.startsWith("$") || k.includes(".")) delete v[k];
    else v[k] = clean(v[k], depth + 1);
  }
  return v;
};
const sanitizeInput = (req, res, next) => {
  if (req.body) clean(req.body);
  if (req.params) clean(req.params);
  if (req.query) for (const k of Object.keys(req.query)) {
    if (k.startsWith("$") || k.includes(".")) delete req.query[k];
    else if (typeof req.query[k] === "object") req.query[k] = String(req.query[k]);   // no ?a[$ne]=x
  }
  next();
};

// ── Rate limiter ────────────────────────────────────────────────────────────
const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60 * 1000).unref();

// skipSuccessful: only failed requests (status >= 400) count — e.g. wrong passwords
const rateLimit = ({ windowMs, max, name, keyFrom, message, skipSuccessful }) => (req, res, next) => {
  if (process.env.RATE_LIMIT_DISABLED === "true" && !isProd()) return next();
  const extra = keyFrom ? String(keyFrom(req) || "") : "";
  const key = `${name}:${req.ip}:${extra}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count += 1;
  if (skipSuccessful) res.on("finish", () => { if (res.statusCode < 400 && b.count > 0) b.count -= 1; });
  res.setHeader("RateLimit-Remaining", Math.max(0, max - b.count));
  if (b.count > max) {
    const wait = Math.ceil((b.reset - now) / 1000);
    res.setHeader("Retry-After", wait);
    return res.status(429).json({ success: false, message: message || `Too many requests. Try again in ${wait} seconds.`, retryAfter: wait });
  }
  next();
};

const hideServerErrors = (req, res, next) => {
  if (!isProd()) return next();
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === "object") {
      body = { success: false, message: "Something went wrong on our side. Please try again." };
    }
    return json(body);
  };
  next();
};

const allowedOrigins = () => (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
// Requests without an Origin header (the mobile app, server-to-server) are allowed;
// browsers are allowed only from CORS_ORIGINS (in development, any localhost too).
const originAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins().includes(origin)) return true;
  return !isProd() && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
};
const corsOptions = {
  origin: (origin, cb) => cb(null, originAllowed(origin)),
  methods: ["GET", "POST", "PUT", "DELETE"],
};

module.exports = { securityHeaders, sanitizeInput, rateLimit, hideServerErrors, corsOptions, originAllowed, isProd };
