// tests/features.api.test.js — driver documents & photo, admin document/complaint/SOS
// views, Guardian Mode live trip link, honest guardian notifications, road ETA.
// Runs against a running backend:  node tests/features.api.test.js [http://localhost:5000]
// Changes made to the demo driver (documents, approval) are restored at the end.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
const mongoose = require("mongoose");
const { io } = require(path.join(__dirname, "..", "..", "node_modules", "socket.io-client"));

const HOST = process.argv[2] || "http://localhost:5000";
const BASE = HOST + "/api";
let passed = 0, failed = 0;
const createdRides = [], sockets = [];
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else    { failed++; console.log(`  ❌ ${name} ${detail}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const api = async (token, method, p, body, raw) => {
  const r = await fetch(BASE + p, {
    method,
    headers: { ...(raw ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  const type = r.headers.get("content-type") || "";
  return { status: r.status, type, body: type.includes("json") ? await r.json() : await r.arrayBuffer() };
};
const login = async (email, password = "password123") => (await api(null, "POST", "/auth/login", { email, password })).body.token;
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(HOST, { transports: ["websocket"], auth: { token } });
  s.events = []; s.onAny((event, payload) => s.events.push({ event, payload }));
  s.on("connect", () => resolve(s)); s.on("connect_error", reject); sockets.push(s);
});
const waitFor = async (s, event, pred = () => true, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { const hit = s.events.find(e => e.event === event && pred(e.payload)); if (hit) return hit.payload; await sleep(150); }
  return null;
};
// A tiny valid PNG (1×1 px)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const DHA = [74.3436, 31.4804], LIBERTY = [74.3462, 31.5118];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const Users = mongoose.connection.collection("users");
  const Rides = mongoose.connection.collection("rides");
  const Ratings = mongoose.connection.collection("ratings");

  const [ayesha, fatima, admin] = await Promise.all([login("ayesha@demo.com"), login("fatima@demo.com"), login("admin@mehfooz.com", "admin123")]);
  check("passenger, driver and admin log in", ayesha && fatima && admin);
  const fatimaDoc = await Users.findOne({ email: "fatima@demo.com" });
  const ayeshaDoc = await Users.findOne({ email: "ayesha@demo.com" });
  const snapshot = { driverDetails: fatimaDoc.driverDetails, profilePhoto: fatimaDoc.profilePhoto || "", isVerified: fatimaDoc.isVerified, isOnline: false, cnicImages: fatimaDoc.cnicImages || {} };
  // The seeded driver has no CNIC photos; a real driver uploads them at signup — simulate that
  await Users.updateOne({ _id: fatimaDoc._id }, { $set: { "cnicImages.uploadedAt": new Date() } });
  const savedContacts = ayeshaDoc.guardianContacts;
  await Rides.updateMany({ $or: [{ passenger: ayeshaDoc._id }, { driver: fatimaDoc._id }], status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Feature test setup" } });

  try {
    console.log("\nDriver documents");
    const before = await api(fatima, "GET", "/driver/documents");
    check("driver can read her documents status (no storage keys)", before.status === 200 && "licensePhoto" in before.body.documents && !JSON.stringify(before.body).includes("drivers/"));
    check("passenger cannot use driver documents API", (await api(ayesha, "GET", "/driver/documents")).status === 403);

    const fd = new FormData();
    fd.append("licensePhoto", new Blob([PNG], { type: "image/png" }), "license.png");
    fd.append("registrationPhoto", new Blob([PNG], { type: "image/png" }), "reg.png");
    fd.append("profilePhoto", new Blob([PNG], { type: "image/png" }), "me.png");
    const up = await api(fatima, "PUT", "/driver/documents", null, fd);
    check("licence, registration and profile photos uploaded", up.status === 200 && up.body.documents.licensePhoto && up.body.documents.registrationPhoto && up.body.documents.profilePhoto, JSON.stringify(up.body).slice(0, 200));
    check("changing licence documents sends an approved driver back to review", up.body.documents.isVerified === false);

    const bad = new FormData();
    bad.append("licensePhoto", new Blob(["not an image"], { type: "text/plain" }), "x.txt");
    check("non-image file rejected", (await api(fatima, "PUT", "/driver/documents", null, bad)).status === 400);
    const badYear = new FormData(); badYear.append("vehicleYear", "20x5");
    check("invalid vehicle year rejected", (await api(fatima, "PUT", "/driver/documents", null, badYear)).status === 400);

    console.log("\nAdmin sees the documents");
    const pending = await api(admin, "GET", "/admin/drivers/pending");
    check("driver appears in admin pending list", (pending.body.drivers || []).some(d => d.email === "fatima@demo.com"));
    for (const kind of ["license", "registration", "profile"]) {
      const img = await api(admin, "GET", `/admin/users/${fatimaDoc._id}/doc/${kind}`);
      check(`admin can view ${kind} photo`, img.status === 200 && img.type.startsWith("image/"));
    }
    check("passenger cannot view licence photo", (await api(ayesha, "GET", `/admin/users/${fatimaDoc._id}/doc/license`)).status === 403);
    const appr = await api(admin, "PUT", `/admin/drivers/${fatimaDoc._id}/approve`, {});
    check("admin approves the driver", appr.status === 200);
    const after = await api(fatima, "GET", "/driver/documents");
    check("approved driver with all documents = Verified Female Driver", after.body.verification?.verified === true && after.body.verification.checks.documents === true, JSON.stringify(after.body.verification?.checks));

    console.log("\nDriver photo for passengers");
    const photo = await api(ayesha, "GET", `/driver/${fatimaDoc._id}/photo`);
    check("passenger can see the driver's profile photo", photo.status === 200 && photo.type.startsWith("image/"));
    check("photo needs login", (await api(null, "GET", `/driver/${fatimaDoc._id}/photo`)).status === 401);

    console.log("\nGuardian Mode");
    await api(ayesha, "PUT", "/auth/update-profile", { guardianContacts: [{ name: "Ammi", phone: "03001234567", relation: "Mother", isActive: true }] });
    const drv = await connect(fatima);
    await api(fatima, "PUT", "/driver/online", { isOnline: true });
    drv.emit("driver:location", { coordinates: [74.3420, 31.4790] });
    await sleep(800);
    const pax = await connect(ayesha);
    const b = await api(ayesha, "POST", "/rides", { pickupAddress: "DHA test", dropoffAddress: "Liberty test", rideType: "economy", pickupCoordinates: DHA, dropoffCoordinates: LIBERTY });
    const rideId = b.body.ride?._id; createdRides.push(rideId);
    check("booking returns the passenger's live trip link", /\/api\/rides\/live\//.test(b.body.ride?.shareLink || ""));
    await waitFor(drv, "ride:incoming", p => String(p.rideId) === String(rideId));
    const acc = await api(fatima, "PUT", `/rides/${rideId}/accept`);
    check("ride accepted", acc.status === 200);
    const found = await waitFor(pax, "ride:driver-found", p => String(p.rideId) === String(rideId));
    check("passenger gets the driver's photo URL (not a storage key)", found?.driver?.photo === `/api/driver/${fatimaDoc._id}/photo`);
    check("passenger sees 'Verified Female Driver'", found?.driver?.verified === true);

    const drvView = await api(fatima, "GET", `/rides/${rideId}`);
    check("driver does not get the trip link or guardian log", !drvView.body.ride.shareLink && !drvView.body.ride.shareToken && !drvView.body.ride.guardianNotifications);
    const paxView = await api(ayesha, "GET", `/rides/${rideId}`);
    const token = paxView.body.ride.shareLink.split("/live/")[1];
    check("passenger's ride details include the link", !!token);

    drv.emit("driver:location", { coordinates: [74.3420, 31.4790], rideIds: [rideId] });
    const upd = await waitFor(pax, "driver:location:update", p => String(p.rideId) === String(rideId) && p.toPickup, 15000);
    check("pickup ETA from the road route", upd?.toPickup?.source === "road" && upd.toPickup.etaMin >= 1, JSON.stringify(upd?.toPickup));

    const live = await fetch(`${BASE}/rides/live/${token}?format=json`).then(r => r.json());
    check("guardian link works without login", live.success && live.trip.status === "accepted");
    check("guardian sees driver, vehicle and plate", live.trip.driver?.name && live.trip.driver.licensePlate !== undefined);
    check("guardian sees the live car position", Array.isArray(live.trip.driverAt));
    check("guardian link has no phone numbers or OTP", !/\+92|"otp"/.test(JSON.stringify(live)));
    const page = await fetch(`${BASE}/rides/live/${token}`).then(r => r.text());
    check("guardian link opens a map page", page.includes("leaflet") && page.includes("Live trip"));
    check("wrong token → 404", (await fetch(`${BASE}/rides/live/nope`)).status === 404);

    await sleep(1500);
    let r = await Rides.findOne({ _id: new mongoose.Types.ObjectId(rideId) });
    const n1 = (r.guardianNotifications || []).find(n => n.event === "driver_assigned");
    check("guardian told 'driver assigned' — status recorded honestly", n1 && n1.contacts[0]?.status === "simulated", JSON.stringify(n1));

    await api(fatima, "PUT", `/rides/${rideId}/arrived`);
    await api(fatima, "POST", `/rides/${rideId}/verify-otp`, { otp: b.body.ride.otp });
    await api(fatima, "PUT", `/rides/${rideId}/complete`);
    await sleep(1500);
    r = await Rides.findOne({ _id: new mongoose.Types.ObjectId(rideId) });
    const events = (r.guardianNotifications || []).map(n => n.event);
    check("guardian told 'trip started' and 'arrived'", events.includes("ride_started") && events.includes("ride_completed"), JSON.stringify(events));
    const liveDone = await fetch(`${BASE}/rides/live/${token}?format=json`).then(r => r.json());
    check("after arrival the link shows completed and no live position", liveDone.trip?.status === "completed" && liveDone.trip.driverAt === null);

    console.log("\nAdmin: complaints and SOS");
    const rate = await api(ayesha, "POST", `/rides/${rideId}/rate`, { stars: 2, hasComplaint: true, complaintType: "rude_behaviour", complaintDetails: "feature test complaint" });
    check("passenger files a complaint", rate.status === 201);
    const comps = await api(admin, "GET", "/admin/complaints?status=pending");
    const mine = (comps.body.complaints || []).find(c => String(c.ride?._id) === String(rideId));
    check("admin sees the complaint with passenger, driver and ride", mine && mine.ratedBy?.name && mine.ratedUser?.name && mine.complaintDetails === "feature test complaint");
    const res = await api(admin, "PUT", `/admin/complaints/${mine?._id}`, { status: "resolved", adminNotes: "spoke to driver" });
    check("admin resolves it with notes", res.status === 200 && res.body.complaint.complaintStatus === "resolved");
    check("passenger cannot read complaints", (await api(ayesha, "GET", "/admin/complaints")).status === 403);
    const sos = await api(ayesha, "POST", "/emergency", { coordinates: [74.344, 31.49] });
    const em = await api(admin, "GET", "/admin/emergencies?status=active");
    check("admin sees active SOS with the incident payload", (em.body.sessions || []).some(s => String(s._id) === String(sos.body.session?._id) && s.incident?.reporter?.name));
    console.log("\nSMS sent from the passenger's own phone (recorded honestly)");
    const dev = await api(ayesha, "POST", `/emergency/${sos.body.session?._id}/device-sms`, { results: [
      { name: "Ammi", phone: "+923001234567", status: "sent" }, { name: "Abbu", phone: "+923007654321", status: "failed", reason: "no_service" }, { name: "X", phone: "1", status: "hacked" } ] });
    check("phone SMS results recorded on the SOS session", dev.status === 200 && dev.body.recorded === 3);
    const em2 = await api(admin, "GET", "/admin/emergencies?status=active");
    const sess = (em2.body.sessions || []).find(s => String(s._id) === String(sos.body.session?._id));
    const devRows = (sess?.contactNotifications || []).filter(c => c.channel === "device_sms");
    check("admin sees per-contact phone SMS status; unknown statuses are not trusted", devRows.length === 3 && devRows[0].status === "sent" && devRows[1].status === "failed" && devRows[2].status === "unknown");
    check("someone else cannot write to her SOS session", (await api(fatima, "POST", `/emergency/${sos.body.session?._id}/device-sms`, { results: [] })).status === 404);
    const gs = await api(ayesha, "POST", `/rides/${rideId}/guardian-sms`, { event: "ride_started", results: [{ name: "Ammi", phone: "+923001234567", status: "sent" }] });
    check("trip-start SMS from her phone recorded on the ride", gs.status === 200);
    check("driver cannot record guardian SMS for the passenger", (await api(fatima, "POST", `/rides/${rideId}/guardian-sms`, { event: "ride_started", results: [] })).status === 404);
    const rv = await api(ayesha, "GET", `/rides/${rideId}`);
    check("passenger's ride shows the trip SMS was sent", (rv.body.ride.guardianNotifications || []).some(n => n.event === "ride_started_device_sms" && n.contacts[0]?.status === "sent"));    if (sos.body.session?._id) await api(ayesha, "PUT", `/emergency/${sos.body.session._id}/resolve`);
  } finally {
    // ── Restore the demo driver and passenger ──
    const now = await Users.findOne({ _id: fatimaDoc._id });
    const fs = require("fs"), root = path.join(__dirname, "..", "uploads", "private");
    for (const k of [now.driverDetails?.licensePhoto, now.driverDetails?.registrationPhoto, now.profilePhoto]) {
      if (k && k.startsWith("drivers/")) fs.rmSync(path.join(root, k), { force: true });
    }
    await Users.updateOne({ _id: fatimaDoc._id }, { $set: snapshot });
    await Users.updateOne({ _id: ayeshaDoc._id }, { $set: { guardianContacts: savedContacts } });
    const ids = createdRides.filter(Boolean).map(id => new mongoose.Types.ObjectId(id));
    await Ratings.deleteMany({ ride: { $in: ids } });
    await Rides.updateMany({ _id: { $in: ids } }, { $set: { rating: null } });
    await require("../services/ratings").recalcDriverRating(fatimaDoc._id);
    sockets.forEach(x => x.close());
    await mongoose.disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => { console.error(e); process.exit(1); });
