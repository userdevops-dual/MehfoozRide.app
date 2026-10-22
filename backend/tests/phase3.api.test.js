// tests/phase3.api.test.js — driver matching, pooling, mood, expiry, fares (Phase 3)
// Runs against a running backend:  node tests/phase3.api.test.js [http://localhost:5000]
// Needs internet (OSRM), the seeded demo accounts, and socket.io-client from the app's
// node_modules. Puts the demo driver online near the test pickups, books test rides
// and cleans everything up at the end.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
const mongoose = require("mongoose");
const { io } = require(path.join(__dirname, "..", "..", "node_modules", "socket.io-client"));

const HOST = process.argv[2] || "http://localhost:5000";
const BASE = HOST + "/api";
let passed = 0, failed = 0;
const createdRides = [];
const sockets = [];

const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else    { failed++; console.log(`  ❌ ${name} ${detail}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const api = async (token, method, p, body) => {
  const r = await fetch(BASE + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
};
const login = async (email, password = "password123") => (await api(null, "POST", "/auth/login", { email, password })).body.token;

// Collects events per socket
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(HOST, { transports: ["websocket"], auth: { token } });
  s.events = [];
  s.onAny((event, payload) => s.events.push({ event, payload }));
  s.on("connect", () => resolve(s));
  s.on("connect_error", reject);
  sockets.push(s);
});
const waitFor = async (s, event, pred = () => true, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = s.events.find(e => e.event === event && pred(e.payload));
    if (hit) return hit.payload;
    await sleep(150);
  }
  return null;
};

// Lahore test points [lng, lat]
const DHA      = [74.3436, 31.4804];
const DHA_NEAR = [74.3480, 31.4830];   // ~0.5 km from DHA
const LIBERTY  = [74.3462, 31.5118];
const LIB_NEAR = [74.3500, 31.5150];   // ~0.5 km from Liberty
const JOHAR    = [74.2700, 31.4700];   // a different direction (west)

const book = async (token, body) => {
  const r = await api(token, "POST", "/rides", {
    pickupAddress: "Test pickup", dropoffAddress: "Test drop-off", rideType: "economy", ...body,
  });
  if (r.body.ride?._id) createdRides.push(r.body.ride._id);
  return r;
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const Rides = mongoose.connection.collection("rides");
  const Users = mongoose.connection.collection("users");

  const [ayesha, zainab, sana, fatima] = await Promise.all([
    login("ayesha@demo.com"), login("zainab@demo.com"), login("sana@demo.com"), login("fatima@demo.com"),
  ]);
  check("demo passengers and driver log in", ayesha && zainab && sana && fatima);

  // Clean slate: no active test rides for these accounts
  const ids = await Users.find({ email: { $in: ["ayesha@demo.com", "zainab@demo.com", "sana@demo.com", "fatima@demo.com"] } }).project({ _id: 1, email: 1 }).toArray();
  const idOf = Object.fromEntries(ids.map(u => [u.email.split("@")[0], u._id]));
  await Rides.updateMany(
    { $or: [{ passenger: { $in: ids.map(u => u._id) } }, { driver: idOf.fatima }], status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 3 test setup" } }
  );

  // Driver online with a fresh GPS fix near DHA
  const drv = await connect(fatima);
  await api(fatima, "PUT", "/driver/online", { isOnline: true });
  drv.emit("driver:location", { coordinates: [74.3420, 31.4790] });
  await sleep(800);
  const pA = await connect(ayesha), pZ = await connect(zainab), pS = await connect(sana);

  console.log("\nMood preference");
  check("invalid mood rejected", (await book(ayesha, { pickupCoordinates: DHA, dropoffCoordinates: LIBERTY, moodPreference: "friendly" })).status === 400);

  console.log("\nDriver matching (server offers the request itself)");
  const r1 = await book(ayesha, { pickupCoordinates: DHA, dropoffCoordinates: LIBERTY, moodPreference: "introvert" });
  check("ride booked", r1.status === 201, JSON.stringify(r1.body).slice(0, 200));
  check("server reports drivers notified", r1.body.driversNotified >= 1, `driversNotified=${r1.body.driversNotified}`);
  check("request has a server expiry time", !!r1.body.ride?.requestExpiresAt);
  const offer1 = await waitFor(drv, "ride:incoming", p => String(p.rideId) === String(r1.body.ride._id));
  check("nearby driver receives the request", !!offer1);
  check("request shows mood, fare, distance, time", offer1?.moodPreference === "introvert" && offer1.fare > 0 && offer1.distanceKm > 0 && offer1.durationMin > 0 && offer1.driverDistanceKm >= 0);

  console.log("\nDecline");
  const dec = await api(fatima, "PUT", `/rides/${r1.body.ride._id}/decline`);
  check("driver can decline", dec.status === 200);
  check("declined driver cannot accept it", (await api(fatima, "PUT", `/rides/${r1.body.ride._id}/accept`)).status === 409);
  await api(ayesha, "PUT", `/rides/${r1.body.ride._id}/cancel`, { reason: "test" });
  check("driver told the request was withdrawn", !!await waitFor(drv, "ride:request-withdrawn", p => String(p.rideId) === String(r1.body.ride._id)));

  console.log("\nScenario G — pooling with consent");
  const z1 = await book(zainab, { pickupCoordinates: DHA, dropoffCoordinates: LIBERTY, isPooled: true });
  const a2 = await book(ayesha, { pickupCoordinates: DHA_NEAR, dropoffCoordinates: LIB_NEAR, isPooled: true });
  check("second consenting compatible passenger is pooled", a2.body.pool?.passengers === 2, JSON.stringify(a2.body.pool));
  const zUpd = await waitFor(pZ, "ride:pool-updated", p => p.pooled === true);
  check("first passenger told about the match with her new fare", !!zUpd && zUpd.yourFare < zUpd.soloFare, JSON.stringify(zUpd));
  check("pooled fare lower than solo fare", a2.body.ride.farePerPassenger < a2.body.ride.soloFare);
  const s1 = await book(sana, { pickupCoordinates: DHA, dropoffCoordinates: LIBERTY, isPooled: false });
  check("passenger who did NOT consent is not pooled", !s1.body.pool && !s1.body.ride.pool);
  await api(sana, "PUT", `/rides/${s1.body.ride._id}/cancel`, { reason: "test" });

  console.log("\nPool accepted by one driver");
  const offerPool = await waitFor(drv, "ride:incoming", p => p.isPooled === true && p.passengers === 2, 20000);
  check("driver offered the pool (2 passengers)", !!offerPool);
  const acc = await api(fatima, "PUT", `/rides/${offerPool?.rideId}/accept`);
  check("accepting assigns both passengers", acc.status === 200 && acc.body.stops?.length === 2, JSON.stringify(acc.body).slice(0, 200));
  check("driver view has no guardian contacts or OTPs", !JSON.stringify(acc.body).includes("guardian") && !JSON.stringify(acc.body).includes('"otp"'));
  check("both passengers told by the server", !!await waitFor(pZ, "ride:driver-found") && !!await waitFor(pA, "ride:driver-found"));
  const zRide = await api(fatima, "GET", `/rides/${z1.body.ride._id}`);
  check("driver cannot see passenger's guardian contacts or OTP", zRide.status === 200 && zRide.body.ride.passenger.guardianContacts === undefined && zRide.body.ride.otp === undefined);

  console.log("\nCompatibility");
  const z2 = await book(sana, { pickupCoordinates: DHA, dropoffCoordinates: JOHAR, isPooled: true });
  const s2pool = z2.body.pool;
  check("different direction is not pooled", !s2pool, JSON.stringify(s2pool));
  await api(sana, "PUT", `/rides/${z2.body.ride._id}/cancel`, { reason: "test" });

  console.log("\nFinal fare (Scenario M basis)");
  const zOtp = z1.body.ride.otp;
  await api(fatima, "PUT", `/rides/${z1.body.ride._id}/arrived`);
  const v = await api(fatima, "POST", `/rides/${z1.body.ride._id}/verify-otp`, { otp: zOtp });
  check("correct OTP starts the pooled ride", v.status === 200);
  const done = await api(fatima, "PUT", `/rides/${z1.body.ride._id}/complete`);
  check("completed with planned distance (no GPS track yet)", done.status === 200 && done.body.ride.distanceSource === "planned");
  check("pooled passenger keeps her discount", done.body.ride.farePerPassenger < done.body.ride.fareBreakdown.baseFare + done.body.ride.fareBreakdown.distanceFare + done.body.ride.fareBreakdown.timeFare);
  check("completing twice is refused", (await api(fatima, "PUT", `/rides/${z1.body.ride._id}/complete`)).status === 400);
  await api(fatima, "PUT", `/rides/${a2.body.ride._id}/cancel`, { reason: "test cleanup" });

  console.log("\nExpiry (stuck requests)");
  const e1 = await book(ayesha, { pickupCoordinates: DHA, dropoffCoordinates: LIBERTY });
  await Rides.updateOne({ _id: new mongoose.Types.ObjectId(e1.body.ride._id) }, { $set: { requestExpiresAt: new Date(Date.now() - 1000) } });
  const exp = await waitFor(pA, "ride:expired", p => String(p.rideId) === String(e1.body.ride._id), 25000);
  check("expired request is cancelled and the passenger is told", !!exp);
  const after = await book(ayesha, { pickupCoordinates: DHA, dropoffCoordinates: LIBERTY });
  check("passenger can book again after expiry (not stuck)", after.status === 201);

  // ── Cleanup ──
  await Rides.updateMany(
    { _id: { $in: createdRides.map(id => new mongoose.Types.ObjectId(id)) }, status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 3 test cleanup" } }
  );
  await api(fatima, "PUT", "/driver/online", { isOnline: false });
  sockets.forEach(s => s.close());
  await mongoose.disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  // Same cleanup as a normal run
  const Rides = mongoose.connection.collection("rides");
  await Rides.updateMany(
    { _id: { $in: createdRides.map(id => new mongoose.Types.ObjectId(id)) }, status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 3 test cleanup" } }
  ).catch(() => {});
  sockets.forEach(s => s.close());
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
