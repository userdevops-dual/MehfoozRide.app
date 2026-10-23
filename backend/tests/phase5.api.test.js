// tests/phase5.api.test.js — safe points, emergency contacts, SOS session,
// live emergency location, incident data (Phase 5)
// Runs against a running backend:  node tests/phase5.api.test.js [http://localhost:5000]
// Needs internet (OSRM / OpenStreetMap), the seeded demo accounts, and socket.io-client.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
const mongoose = require("mongoose");
const { io } = require(path.join(__dirname, "..", "..", "node_modules", "socket.io-client"));

const HOST = process.argv[2] || "http://localhost:5000";
const BASE = HOST + "/api";
let passed = 0, failed = 0;
const createdRides = [], createdSessions = [], sockets = [];

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
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, body: json };
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

const DHA     = [74.3436, 31.4804];
const LIBERTY = [74.3462, 31.5118];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const Rides = mongoose.connection.collection("rides");
  const Users = mongoose.connection.collection("users");
  const Sessions = mongoose.connection.collection("emergencysessions");

  const [ayesha, fatima] = await Promise.all([login("ayesha@demo.com"), login("fatima@demo.com")]);
  check("demo passenger and driver log in", ayesha && fatima);
  const ids = await Users.find({ email: { $in: ["ayesha@demo.com", "fatima@demo.com"] } }).project({ _id: 1, email: 1, guardianContacts: 1 }).toArray();
  const ayeshaDoc = ids.find(u => u.email === "ayesha@demo.com");
  const savedContacts = ayeshaDoc.guardianContacts;
  await Rides.updateMany(
    { $or: [{ passenger: { $in: ids.map(u => u._id) } }, { driver: { $in: ids.map(u => u._id) } }], status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 5 test setup" } }
  );
  await Sessions.updateMany({ raisedBy: { $in: ids.map(u => u._id) }, status: "active" }, { $set: { status: "resolved", resolvedNote: "Phase 5 test setup" } });

  console.log("\nEmergency contacts");
  check("contact without a valid phone rejected", (await api(ayesha, "PUT", "/auth/update-profile", { guardianContacts: [{ name: "Ammi", phone: "123", isActive: true }] })).status === 400);
  check("more than 5 contacts rejected", (await api(ayesha, "PUT", "/auth/update-profile", { guardianContacts: Array(6).fill({ name: "X", phone: "03001234567", isActive: true }) })).status === 400);
  const saved = await api(ayesha, "PUT", "/auth/update-profile", { guardianContacts: [
    { name: "Ammi", phone: "0300 1234567", relation: "Mother", isActive: true },
    { name: "Abbu", phone: "+923007654321", relation: "Father", isActive: true },
  ] });
  check("contacts saved with relation and normalised phone", saved.status === 200 && saved.body.user.guardianContacts[0].relation === "Mother" && saved.body.user.guardianContacts[0].phone === "+923001234567", JSON.stringify(saved.body.user?.guardianContacts));

  console.log("\nSafe places near a real location (OpenStreetMap)");
  const sp = await api(ayesha, "GET", `/geo/safe-places?lat=${LIBERTY[1]}&lng=${LIBERTY[0]}`);
  check("nearby safe places returned", sp.status === 200 && sp.body.count > 0, JSON.stringify(sp.body).slice(0, 200));
  const places = sp.body.places || [];
  check("each place has a name, type, real coordinates and distance", places.every(p => p.name && ["police", "hospital", "public"].includes(p.type) && Math.abs(p.lat - LIBERTY[1]) < 0.1 && p.distanceKm >= 0));
  const police = await api(ayesha, "GET", `/geo/safe-places?lat=${LIBERTY[1]}&lng=${LIBERTY[0]}&type=police`);
  check("filter by type (police)", police.status === 200 && (police.body.places || []).every(p => p.type === "police"));
  check("invalid location rejected", (await api(ayesha, "GET", "/geo/safe-places?lat=abc&lng=1")).status === 400);

  // Active ride with a driver
  const drv = await connect(fatima);
  await api(fatima, "PUT", "/driver/online", { isOnline: true });
  drv.emit("driver:location", { coordinates: [74.3420, 31.4790] });
  await sleep(800);
  const pax = await connect(ayesha);
  const booked = await api(ayesha, "POST", "/rides", { pickupAddress: "DHA test", dropoffAddress: "Liberty test", rideType: "economy", pickupCoordinates: DHA, dropoffCoordinates: LIBERTY });
  const rideId = booked.body.ride?._id; createdRides.push(rideId);
  await waitFor(drv, "ride:incoming", p => String(p.rideId) === String(rideId));
  check("ride booked and accepted", booked.status === 201 && (await api(fatima, "PUT", `/rides/${rideId}/accept`)).status === 200);

  console.log("\nScenario J — safe point persists for the active ride");
  const target = places.find(p => p.type === "police") || places[0];
  check("point outside Pakistan rejected", (await api(ayesha, "POST", `/rides/${rideId}/safe-points`, { name: "X", coordinates: [0, 0] })).status === 400);
  check("driver cannot add passenger's safe points", (await api(fatima, "POST", `/rides/${rideId}/safe-points`, { name: "X", coordinates: [target.lng, target.lat] })).status === 404);
  const add = await api(ayesha, "POST", `/rides/${rideId}/safe-points`, { name: target.name, type: target.type, address: target.address, coordinates: [target.lng, target.lat], source: "osm" });
  check("passenger marks a real safe point", add.status === 201 && add.body.safePoints.length === 1);
  check("driver told about the safe point", !!await waitFor(drv, "ride:safe-points-updated", p => p.safePoints?.length === 1));
  const view = await api(ayesha, "GET", `/rides/${rideId}`);
  const point = view.body.ride.safePoints?.[0];
  check("safe point saved on the ride (persists)", point && point.name === target.name && point.coordinates[0] === target.lng);

  console.log("\nSafe-point request → driver navigation");
  const reqSp = await api(ayesha, "POST", `/rides/${rideId}/safe-points/${point._id}/request`);
  check("passenger requests the safe point", reqSp.status === 200 && reqSp.body.point?.name === target.name);
  check("route from driver to safe point (distance/time)", reqSp.body.route?.distanceKm > 0, JSON.stringify(reqSp.body.route && { ...reqSp.body.route, coordinates: reqSp.body.route.coordinates?.length }));
  const drvReq = await waitFor(drv, "ride:safe-point-requested", p => String(p.rideId) === String(rideId));
  check("driver receives the safe point with navigation info", !!drvReq && drvReq.point.coordinates.length === 2 && drvReq.route);
  check("driver acknowledges", (await api(fatima, "PUT", `/rides/${rideId}/safe-point-ack`)).status === 200);
  check("passenger told the driver acknowledged", !!await waitFor(pax, "ride:safe-point-acknowledged", p => String(p.rideId) === String(rideId)));

  console.log("\nScenario L — SOS");
  const here = [74.3441, 31.4950];
  const sos = await api(ayesha, "POST", "/emergency", { rideId, coordinates: here, accuracy: 12 });
  const s = sos.body.session || {};
  if (s._id) createdSessions.push(s._id);
  check("SOS starts an emergency session", sos.status === 201 && s.status === "active", JSON.stringify(sos.body).slice(0, 200));
  check("location captured", s.lastLocation?.coordinates?.[0] === here[0] && s.lastLocation.accuracy === 12);
  check("ride + trip captured (pickup, destination, route)", s.incident?.trip?.rideId === String(rideId) && s.incident.trip.dropoff?.coordinates?.length === 2 && !!s.incident.trip.route);
  check("driver + vehicle captured", s.incident?.driver?.name && s.incident.driver.licensePlate !== undefined && typeof s.incident.driver.verified === "boolean");
  check("passenger + emergency contacts captured", s.incident?.reporter?.name && s.incident.reporter.emergencyContacts.length === 2);
  check("safe points included in the incident", s.incident?.trip?.safePoints?.length === 1);
  check("contacts workflow ran — demo status is honest ('simulated')", s.contactNotifications?.length === 2 && s.contactNotifications.every(c => c.status === "simulated"), JSON.stringify(s.contactNotifications?.map(c => c.status)));
  check("police dispatch NOT claimed (simulated / not_integrated)", ["simulated", "not_integrated"].includes(s.police?.status), s.police?.status);
  check("live-location link created", /\/api\/emergency\/live\//.test(s.liveLink || ""));
  check("driver told an SOS is active on the ride", !!await waitFor(drv, "sos:raised", p => String(p.rideId) === String(rideId)));
  const again = await api(ayesha, "POST", "/emergency", { rideId, coordinates: here });
  check("pressing SOS again reuses the active session", again.status === 200 && again.body.session._id === s._id);
  const r = await Rides.findOne({ _id: new mongoose.Types.ObjectId(rideId) });
  check("ride flagged sosActivated", r.sosActivated === true);

  console.log("\nLive emergency location");
  for (const [i, c] of [[74.3445, 31.4960], [74.3450, 31.4970]].entries()) {
    const u = await api(ayesha, "POST", `/emergency/${s._id}/location`, { coordinates: c, accuracy: 8 + i });
    if (i === 1) check("location updates accepted", u.status === 200 && u.body.lastLocation.coordinates[1] === 31.4970);
  }
  check("invalid location rejected", (await api(ayesha, "POST", `/emergency/${s._id}/location`, { coordinates: [999, 1] })).status === 400);
  check("someone else cannot update the session", (await api(fatima, "POST", `/emergency/${s._id}/location`, { coordinates: here })).status === 404);
  const token = s.liveLink.split("/live/")[1];
  const live = await fetch(`${BASE}/emergency/live/${token}?format=json`).then(x => x.json());
  check("contacts' live link shows the latest location (no login)", live.live?.lastLocation?.coordinates?.[1] === 31.4970 && live.live.trail.length === 4);   // start + repeat press + 2 updates
  check("live link does not expose phone numbers", !JSON.stringify(live).includes("+92"));
  const page = await fetch(`${BASE}/emergency/live/${token}`).then(x => x.text());
  check("live link opens a map page", page.includes("leaflet") && page.includes("Live location"));
  check("wrong token → not found", (await fetch(`${BASE}/emergency/live/nope`)).status === 404);
  const active = await api(ayesha, "GET", "/emergency/active");
  check("app can reload the active session", active.body.session?._id === s._id && active.body.session.locationCount === 4);

  console.log("\nI am safe");
  const res = await api(ayesha, "PUT", `/emergency/${s._id}/resolve`, { note: "test" });
  check("session resolved", res.status === 200 && res.body.session.status === "resolved");
  check("contacts told she is safe (same honest status)", res.body.session.contactNotifications.length === 4);
  check("no location updates after resolving", (await api(ayesha, "POST", `/emergency/${s._id}/location`, { coordinates: here })).status === 409);
  const liveAfter = await fetch(`${BASE}/emergency/live/${token}?format=json`).then(x => x.json());
  check("live link shows 'safe'", liveAfter.live.status === "resolved");

  console.log("\nDriver safety — SOS over the socket");
  drv.emit("sos:activated", { rideId, coordinates: [74.3420, 31.4790] });
  const conf = await waitFor(drv, "sos:confirmed");
  check("driver SOS recorded (socket) and confirmed with real statuses", !!conf?.sessionId && conf.police?.status);
  if (conf?.sessionId) createdSessions.push(conf.sessionId);
  check("passenger told the driver raised SOS", !!await waitFor(pax, "sos:raised", p => p.byRole === "driver"));
  if (conf?.sessionId) await api(fatima, "PUT", `/emergency/${conf.sessionId}/resolve`);
  const sosNoRide = await api(ayesha, "POST", "/emergency", { coordinates: here });
  check("SOS works without a ride too (e.g. from home screen)", sosNoRide.status === 201);
  if (sosNoRide.body.session?._id) await api(ayesha, "PUT", `/emergency/${sosNoRide.body.session._id}/resolve`);

  // ── Cleanup ──
  await Users.updateOne({ _id: ayeshaDoc._id }, { $set: { guardianContacts: savedContacts } });
  await Rides.updateMany(
    { _id: { $in: createdRides.filter(Boolean).map(id => new mongoose.Types.ObjectId(id)) }, status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 5 test cleanup" } }
  );
  await api(fatima, "PUT", "/driver/online", { isOnline: false });
  sockets.forEach(x => x.close());
  await mongoose.disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  const Rides = mongoose.connection.collection("rides");
  await Rides.updateMany(
    { _id: { $in: createdRides.filter(Boolean).map(id => new mongoose.Types.ObjectId(id)) }, status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 5 test cleanup" } }
  ).catch(() => {});
  sockets.forEach(x => x.close());
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
