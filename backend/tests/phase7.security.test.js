// tests/phase7.security.test.js — security hardening checks (Phase 7)
// Runs against a running backend:  node tests/phase7.security.test.js [http://localhost:5000]
// Uses made-up e-mails / phone numbers for the rate-limit checks, so real demo
// accounts are never locked out.
const HOST = process.argv[2] || "http://localhost:5000";
const BASE = HOST + "/api";
let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else    { failed++; console.log(`  ❌ ${name} ${detail}`); }
};
const req = async (method, p, { token, body, raw, headers = {} } = {}) => {
  const r = await fetch(BASE + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await r.clone().json(); } catch {}
  return { status: r.status, headers: r.headers, body: json };
};
const login = async (email) => (await req("POST", "/auth/login", { body: { email, password: "password123" } })).body?.token;
const rnd = () => Math.random().toString(36).slice(2, 8);

(async () => {
  console.log("\nHeaders");
  const h = await req("GET", "/rides/my-rides");
  check("X-Powered-By hidden", !h.headers.get("x-powered-by"));
  check("nosniff + frame-deny headers", h.headers.get("x-content-type-options") === "nosniff" && h.headers.get("x-frame-options") === "DENY");

  console.log("\nAuthentication required");
  for (const [m, p] of [["GET", "/rides/my-rides"], ["GET", "/driver/stats"], ["POST", "/emergency"], ["GET", "/admin/drivers/pending"], ["GET", "/geo/search?q=liberty"]]) {
    check(`${m} ${p.split("?")[0]} without login → 401`, (await req(m, p)).status === 401);
  }
  check("forged token rejected", (await req("GET", "/auth/me", { token: "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.bad" })).status === 401);

  const [ayesha, fatima] = await Promise.all([login("ayesha@demo.com"), login("fatima@demo.com")]);
  check("demo accounts still log in", ayesha && fatima);

  console.log("\nRoles");
  check("passenger cannot use admin API", (await req("GET", "/admin/drivers/pending", { token: ayesha })).status === 403);
  check("driver cannot use admin API", (await req("GET", "/admin/drivers/pending", { token: fatima })).status === 403);
  check("passenger cannot read driver stats", (await req("GET", "/driver/stats", { token: ayesha })).status === 403);

  console.log("\nInput handling");
  const inj = await req("POST", "/auth/login", { body: { email: { $ne: null }, password: { $ne: null } } });
  check("NoSQL operator login ($ne) does not log in", inj.status >= 400 && !inj.body?.token, `${inj.status}`);
  const q = await req("GET", "/rides/my-rides?status[$ne]=x", { token: ayesha });
  check("operator in query string is neutralised", q.status === 200);
  check("broken JSON → 400 (not 500)", (await req("POST", "/auth/login", { raw: "{bad json" })).status === 400);
  check("oversized JSON body → 413", (await req("POST", "/auth/login", { raw: JSON.stringify({ email: "x", pad: "a".repeat(200 * 1024) }) })).status === 413);
  const bad = await req("GET", "/rides/not-an-id", { token: ayesha });
  check("invalid ride id → 4xx (not a server error)", bad.status >= 400 && bad.status < 500, `${bad.status}`);
  const otherRide = await req("GET", "/rides/000000000000000000000000", { token: ayesha });
  check("unknown ride → 404", otherRide.status === 404);

  console.log("\nPrivate data");
  const me = await req("GET", "/auth/me", { token: fatima });
  const s = JSON.stringify(me.body);
  check("/auth/me has no password hash", !/"password"/.test(s));
  check("/auth/me has no document storage keys", !/cnicPhoto|licensePhoto|registrationPhoto|"front"|"back"/.test(s));
  check("/auth/me has no fraud counters", !/otpFailures/.test(s));

  console.log("\nCORS");
  const evil = await fetch(BASE + "/auth/login", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
  check("unknown website origin not allowed", evil.headers.get("access-control-allow-origin") !== "https://evil.example" && evil.headers.get("access-control-allow-origin") !== "*");
  const app = await fetch(BASE + "/auth/login", { method: "OPTIONS", headers: { "Access-Control-Request-Method": "POST" } });
  check("app requests (no Origin) still work", app.status < 400);

  console.log("\nRate limits");
  const email = `nobody_${rnd()}@test.invalid`;
  let lastLogin;
  for (let i = 0; i < 11; i++) lastLogin = await req("POST", "/auth/login", { body: { email, password: "wrongpass1" } });
  check("11th wrong password in 15 min → 429", lastLogin.status === 429, `${lastLogin.status}`);
  check("rate-limit tells when to retry", !!lastLogin.headers.get("retry-after"));
  check("other accounts not affected", !!(await login("ayesha@demo.com")));
  const phone = `0300${Math.floor(1000000 + Math.random() * 8999999)}`;
  let lastOtp;
  for (let i = 0; i < 6; i++) lastOtp = await req("POST", "/auth/send-otp", { body: { phone } });
  check("6th OTP request for one number → 429", lastOtp.status === 429, `${lastOtp.status}`);

  console.log("\nSocket");
  check("server still answers after the checks", (await req("GET", "/rides/my-rides", { token: ayesha })).status === 200);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
