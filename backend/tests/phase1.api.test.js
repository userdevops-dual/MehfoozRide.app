// tests/phase1.api.test.js — end-to-end checks for registration (Phase 1)
// Runs against a running backend:  node tests/phase1.api.test.js [http://localhost:5000]
// Needs DEMO_MODE=true and SMS_PROVIDER=demo (uses the demo OTP returned by the API).
// Creates test users and deletes them (and their CNIC photos) at the end.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const storage  = require("../services/storage");

const BASE = (process.argv[2] || "http://localhost:5000") + "/api";
let passed = 0, failed = 0;
const created = [];

const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else    { failed++; console.log(`  ❌ ${name} ${detail}`); }
};

const post = async (path, body) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

// 1x1 JPEG
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

const signup = async (fields, { images = true } = {}) => {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => v !== undefined && fd.append(k, v));
  if (images) {
    fd.append("cnicFront", new Blob([JPEG], { type: "image/jpeg" }), "front.jpg");
    fd.append("cnicBack",  new Blob([JPEG], { type: "image/jpeg" }), "back.jpg");
  }
  const r = await fetch(BASE + "/auth/signup", { method: "POST", body: fd });
  const body = await r.json();
  if (body.user?._id) created.push(body.user._id);
  return { status: r.status, body };
};

const rand = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const femaleCNIC = () => `35202${rand(7)}${[0, 2, 4, 6, 8][Math.floor(Math.random() * 5)]}`;
const newPhone   = () => `0399${rand(7)}`;

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  console.log("\nScenario C — invalid CNIC formats are rejected");
  for (const [label, cnic] of [["12 digits", "352021234567"], ["letters", "35202-12345A7-2"], ["empty", ""], ["region code 0", "0520212345672"], ["region code 9", "9520212345672"]]) {
    const r = await post("/auth/verify-cnic", { cnic });
    check(`${label} → rejected`, r.status === 400 && r.body.cnicVerified === false, JSON.stringify(r.body));
  }

  console.log("\nScenario B — odd last digit (male) is rejected with the exact message");
  {
    const r = await post("/auth/verify-cnic", { cnic: "35202 1234567 1" });
    check("odd digit → not eligible", r.status === 400 && r.body.reason === "not_eligible");
    check("exact rejection message", r.body.message === "This CNIC is not eligible for registration in Mehfooz Ride because this application is currently restricted to female users.");
  }
  {
    const r = await post("/auth/verify-cnic", { cnic: "3520212345672" });
    check("even digit, no hyphens → eligible + formatted", r.status === 200 && r.body.cnic === "35202-1234567-2", JSON.stringify(r.body));
  }

  console.log("\nScenario D — phone OTP");
  const phone = newPhone();
  {
    const r = await post("/auth/send-otp", { phone: "12345" });
    check("invalid phone → rejected", r.status === 400);
  }
  const sent = await post("/auth/send-otp", { phone });
  check("send OTP → ok, labelled as demo", sent.status === 200 && sent.body.demo === true && /^\d{6}$/.test(sent.body.demoOtp), JSON.stringify(sent.body));
  {
    const r = await post("/auth/send-otp", { phone });
    check("resend within cooldown → 429", r.status === 429);
  }
  {
    const r = await post("/auth/verify-phone-otp", { phone, otp: "000001" === sent.body.demoOtp ? "000002" : "000001" });
    check("wrong OTP → blocked with attempts left", r.status === 400 && typeof r.body.attemptsLeft === "number", JSON.stringify(r.body));
  }
  const verified = await post("/auth/verify-phone-otp", { phone, otp: sent.body.demoOtp });
  const token = verified.body.phoneVerificationToken;
  check("correct OTP → verified + token", verified.status === 200 && !!token);

  console.log("\nSignup protections");
  const base = { name: "Test Passenger", email: `test.${rand(8)}@phase1.test`, phone, password: "secret123", role: "passenger", cnic: femaleCNIC() };
  {
    const r = await signup({ ...base });
    check("no phone token → rejected", r.status === 400 && r.body.phoneVerified === false);
  }
  {
    const r = await signup({ ...base, phoneVerificationToken: "forged" });
    check("forged phone token → rejected", r.status === 400);
  }
  {
    const r = await signup({ ...base, phoneVerificationToken: token }, { images: false });
    check("no CNIC photos → rejected", r.status === 400 && /front and back/.test(r.body.message));
  }
  {
    const r = await signup({ ...base, password: "short", phoneVerificationToken: token });
    check("weak password → rejected", r.status === 400 && /at least 8/.test(r.body.message));
  }
  {
    const r = await signup({ ...base, cnic: "35202-1234567-3", phoneVerificationToken: token });
    check("odd CNIC at signup (bypassing the app) → rejected", r.status === 400 && r.body.reason === "not_eligible");
  }
  {
    const r = await signup({ ...base, gender: "male", cnic: "1234", phoneVerificationToken: token });
    check("malformed CNIC at signup → rejected", r.status === 400);
  }

  console.log("\nScenario A — female registration succeeds");
  const ok = await signup({ ...base, phoneVerificationToken: token });
  check("signup → 201 with token", ok.status === 201 && !!ok.body.token, JSON.stringify(ok.body));
  check("gender decided by server = female", ok.body.user?.gender === "female");
  check("CNIC photos not exposed in response", !JSON.stringify(ok.body).includes("cnicImages"));
  {
    const r = await signup({ ...base, email: `again.${rand(6)}@phase1.test`, cnic: femaleCNIC(), phoneVerificationToken: token });
    check("phone token is single-use", r.status === 400);
  }

  if (ok.body.user?._id) {
    const u = await mongoose.connection.collection("users").findOne({ _id: new mongoose.Types.ObjectId(ok.body.user._id) });
    check("password stored hashed (bcrypt)", u.password.startsWith("$2") && u.password !== base.password);
    check("CNIC stored normalized", /^\d{5}-\d{7}-\d$/.test(u.cnic));
    check("CNIC photos saved privately", !!u.cnicImages?.front && !!(await storage.read(u.cnicImages.front).catch(() => null)));
    const me = await fetch(BASE + "/auth/me", { headers: { Authorization: `Bearer ${ok.body.token}` } }).then(r => r.json());
    check("/auth/me does not expose CNIC photo keys", !JSON.stringify(me).includes("cnic/"));
    const login = await post("/auth/login", { email: phone, password: base.password });
    check("login with 03xx phone number works", login.status === 200 && login.body.success);
    const pub = await fetch(`${BASE.replace("/api", "")}/uploads/private/${u.cnicImages.front}`);
    check("CNIC photo not publicly reachable", pub.status === 404);
  }

  // Clean up test users and their CNIC photos
  for (const id of created) {
    const u = await mongoose.connection.collection("users").findOne({ _id: new mongoose.Types.ObjectId(id) });
    for (const k of [u?.cnicImages?.front, u?.cnicImages?.back]) if (k) await storage.remove(k).catch(() => {});
    await mongoose.connection.collection("users").deleteOne({ _id: new mongoose.Types.ObjectId(id) });
  }
  await mongoose.connection.collection("phoneotps").deleteMany({ phone: { $regex: "^\\+92399" } });
  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => { console.error(e); await mongoose.disconnect().catch(() => {}); process.exit(1); });
