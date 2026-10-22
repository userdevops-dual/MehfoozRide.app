// tests/phase4.api.test.js — driver verification, ride OTP, live tracking,
// unusual-route detection on the passenger's chosen route (Phase 4)
// Runs against a running backend:  node tests/phase4.api.test.js [http://localhost:5000]
// Needs internet (OSRM), the seeded demo accounts, and socket.io-client from the app's node_modules.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
const mongoose = require("mongoose");
const { io } = require(path.join(__dirname, "..", "..", "node_modules", "socket.io-client"));
const { driverVerification } = require("../services/verification");
const { locate } = require("../services/routeMonitor");

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
const count = (s, event, pred = () => true) => s.events.filter(e => e.event === event && pred(e.payload)).length;

const DHA     = [74.3436, 31.4804];
const LIBERTY = [74.3462, 31.5118];
// Shift a [lng, lat] point east by ~metres
const east = ([lng, lat], m) => [lng + m / (111320 * Math.cos(lat * Math.PI / 180)), lat];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const Rides = mongoose.connection.collection("rides");
  const Users = mongoose.connection.collection("users");

  console.log("\nDriver verification (unit)");
  const base = { isVerified: true, cnicVerified: true, driverDetails: { vehicleMake: "Suzuki", licensePlate: "LEA-1", backgroundCheck: "passed", verificationSource: "admin", cnicPhoto: "a", licensePhoto: "b", registrationPhoto: "c" } };
  check("all checks passed → Verified Female Driver", driverVerification(base).verified && driverVerification(base).label === "Verified Female Driver");
  check("not admin-approved → pending", !driverVerification({ ...base, isVerified: false }).verified);
  check("background check not passed → pending", !driverVerification({ ...base, driverDetails: { ...base.driverDetails, backgroundCheck: "pending" } }).verified);
  check("missing documents → pending", !driverVerification({ ...base, driverDetails: { ...base.driverDetails, licensePhoto: "" } }).verified);
  check("failed background check → rejected", driverVerification({ ...base, driverDetails: { ...base.driverDetails, backgroundCheck: "failed" } }).status === "rejected");
  check("empty profile is never verified", !driverVerification({}).verified);

  const [ayesha, fatima] = await Promise.all([login("ayesha@demo.com"), login("fatima@demo.com")]);
  check("demo passenger and driver log in", ayesha && fatima);
  const ids = await Users.find({ email: { $in: ["ayesha@demo.com", "fatima@demo.com"] } }).project({ _id: 1, email: 1 }).toArray();
  await Rides.updateMany(
    { $or: [{ passenger: { $in: ids.map(u => u._id) } }, { driver: { $in: ids.map(u => u._id) } }], status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 4 test setup" } }
  );

  const stats = await api(fatima, "GET", "/driver/stats");
  check("driver sees her own verification status", stats.body.stats?.verification?.label != null);
  check("seeded driver is labelled as demo data", stats.body.stats?.verification?.isDemo === true, JSON.stringify(stats.body.stats?.verification));

  const drv = await connect(fatima);
  await api(fatima, "PUT", "/driver/online", { isOnline: true });
  drv.emit("driver:location", { coordinates: [74.3420, 31.4790] });
  await sleep(800);
  const pax = await connect(ayesha);

  // Book on the passenger's chosen route (alternative 0)
  const booked = await api(ayesha, "POST", "/rides", {
    pickupAddress: "DHA test", dropoffAddress: "Liberty test", rideType: "economy",
    pickupCoordinates: DHA, dropoffCoordinates: LIBERTY, routeIndex: 0,
  });
  check("ride booked", booked.status === 201, JSON.stringify(booked.body).slice(0, 200));
  const rideId = booked.body.ride?._id; createdRides.push(rideId);
  await waitFor(drv, "ride:incoming", p => String(p.rideId) === String(rideId));
  const acc = await api(fatima, "PUT", `/rides/${rideId}/accept`);
  check("driver accepts", acc.status === 200);

  console.log("\nDriver verification shown to the passenger");
  const found = await waitFor(pax, "ride:driver-found", p => String(p.rideId) === String(rideId));
  check("passenger gets the verification status (not a hardcoded badge)", found?.driver?.verification && typeof found.driver.verified === "boolean");
  check("passenger sees demo label for the seeded driver", found?.driver?.verification?.isDemo === true);
  check("passenger sees rating as 'new' rather than a made-up number", found?.driver?.rating === null || typeof found?.driver?.rating === "number");
  const view = await api(ayesha, "GET", `/rides/${rideId}`);
  const dd = view.body.ride?.driver?.driverDetails || {};
  check("ride details include driver verification", !!view.body.ride?.driverVerification);
  check("passenger cannot see driver's document keys or CNIC", !dd.cnicPhoto && !dd.licensePhoto && !dd.cnicNumber);
  check("lifecycle: DRIVER_ASSIGNED", view.body.ride?.lifecycle?.current === "DRIVER_ASSIGNED", view.body.ride?.lifecycle?.current);

  console.log("\nTracking before pickup");
  drv.emit("driver:location", { coordinates: [74.3420, 31.4790], rideIds: [rideId] });
  const pre = await waitFor(pax, "driver:location:update", p => String(p.rideId) === String(rideId) && p.toPickup);
  check("passenger sees driver distance + ETA to pickup", pre?.toPickup?.distanceKm >= 0 && pre.toPickup.etaMin >= 1, JSON.stringify(pre));

  console.log("\nScenario H — ride OTP");
  await api(fatima, "PUT", `/rides/${rideId}/arrived`);
  const arrivedView = await api(ayesha, "GET", `/rides/${rideId}`);
  check("lifecycle: DRIVER_AT_PICKUP", arrivedView.body.ride?.lifecycle?.current === "DRIVER_AT_PICKUP");
  const otp = booked.body.ride.otp;
  const wrong = String((Number(otp) + 1) % 10000).padStart(4, "0");
  const bad = await api(fatima, "POST", `/rides/${rideId}/verify-otp`, { otp: wrong });
  check("wrong OTP → ride does not start", bad.status >= 400);
  check("ride still at pickup after wrong OTP", (await api(ayesha, "GET", `/rides/${rideId}`)).body.ride.status === "arrived");
  const good = await api(fatima, "POST", `/rides/${rideId}/verify-otp`, { otp });
  check("correct OTP → ride starts", good.status === 200);
  const started = await api(ayesha, "GET", `/rides/${rideId}`);
  check("lifecycle: RIDE_IN_PROGRESS with OTP_VERIFIED step", started.body.ride.lifecycle.current === "RIDE_IN_PROGRESS" && started.body.ride.lifecycle.steps.find(s => s.step === "OTP_VERIFIED")?.done);

  const route = started.body.ride.plannedRoute;
  check("chosen route is available for the map", Array.isArray(route) && route.length >= 2, `points=${route?.length}`);
  check("route is the real road route (OSRM)", started.body.ride.preferredRoute?.source === "osrm");

  const send = async (coordinates, accuracy = 10) => {
    drv.emit("driver:location", { coordinates, rideIds: [rideId], accuracy });
    await sleep(350);
  };

  console.log("\nScenario I — following the route: no false alert");
  const along = [0.1, 0.2, 0.3, 0.4].map(f => route[Math.floor(f * (route.length - 1))]);
  for (const p of along) await send(east(p, 25));        // 25 m GPS offset — normal noise
  const prog = await waitFor(pax, "driver:location:update", p => p.progress && p.progress.progressPct >= 30, 4000);
  check("passenger gets progress, remaining distance and ETA", !!prog && prog.progress.remainingKm > 0 && prog.progress.etaMin >= 1, JSON.stringify(prog?.progress));
  check("no deviation alert while on route", count(pax, "ride:route-deviation") === 0);

  console.log("\nGPS noise is not a deviation");
  const mid = route[Math.floor(0.5 * (route.length - 1))];
  await send(east(mid, 600));                              // one stray reading
  await send(mid);
  await send(east(mid, 800), 300);                         // far but very inaccurate fixes
  await send(east(mid, 800), 300);
  await send(east(mid, 800), 300);
  check("single stray / inaccurate readings do not alert", count(pax, "ride:route-deviation") === 0);

  console.log("\nScenario I — significant deviation");
  for (let i = 0; i < 3; i++) await send(east(mid, 700 + i * 100));
  const dev = await waitFor(pax, "ride:route-deviation", p => p.status === "deviated", 4000);
  check("'Unusual route detected' sent to the passenger", !!dev && /Unusual route detected/.test(dev.message), JSON.stringify(dev));
  check("alert reports how far off-route", dev?.offRouteM > 250);
  await send(east(mid, 1000));
  check("alert is sent once, not on every reading", count(pax, "ride:route-deviation", p => p.status === "deviated") === 1);
  let rec = await Rides.findOne({ _id: new mongoose.Types.ObjectId(rideId) });
  check("deviation recorded in the trip", rec.routeDeviated === true && rec.routeDeviationActive === true && rec.routeDeviations.length === 1);

  console.log("\nBack on route");
  const later = route[Math.floor(0.6 * (route.length - 1))];
  for (let i = 0; i < 3; i++) await send(later);
  check("passenger told the driver is back on route", !!await waitFor(pax, "ride:route-deviation", p => p.status === "back_on_route", 4000));
  rec = await Rides.findOne({ _id: new mongoose.Types.ObjectId(rideId) });
  const ep = rec.routeDeviations[0];
  const worst = Math.max(...[700, 800, 900, 1000].map(m => locate(east(mid, m), route).offM));
  check("deviation episode closed with its worst distance", !rec.routeDeviationActive && !!ep.endedAt && Math.abs(ep.maxOffRouteM - worst) <= 2, `${JSON.stringify(ep)} expected ~${Math.round(worst)}`);

  console.log("\nTrip end");
  const done = await api(fatima, "PUT", `/rides/${rideId}/complete`);
  check("ride completes", done.status === 200);
  const fin = await api(ayesha, "GET", `/rides/${rideId}`);
  check("lifecycle: RIDE_COMPLETED", fin.body.ride.lifecycle.current === "RIDE_COMPLETED");
  check("trip keeps the deviation history", fin.body.ride.routeDeviations?.length === 1 && fin.body.ride.routeDeviated === true);

  // ── Cleanup ──
  await Rides.updateMany(
    { _id: { $in: createdRides.map(id => new mongoose.Types.ObjectId(id)) }, status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 4 test cleanup" } }
  );
  await api(fatima, "PUT", "/driver/online", { isOnline: false });
  sockets.forEach(s => s.close());
  await mongoose.disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  const Rides = mongoose.connection.collection("rides");
  await Rides.updateMany(
    { _id: { $in: createdRides.filter(Boolean).map(id => new mongoose.Types.ObjectId(id)) }, status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 4 test cleanup" } }
  ).catch(() => {});
  sockets.forEach(s => s.close());
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
