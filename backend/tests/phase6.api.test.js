// tests/phase6.api.test.js — ride completion, fare settlement, rating,
// ride history, driver statistics (Phase 6)
// Runs against a running backend:  node tests/phase6.api.test.js [http://localhost:5000]
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
const api = async (token, method, p, body) => {
  const r = await fetch(BASE + p, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
};
const login = async (email) => (await api(null, "POST", "/auth/login", { email, password: "password123" })).body.token;
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
const DHA = [74.3436, 31.4804], LIBERTY = [74.3462, 31.5118];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const Rides = mongoose.connection.collection("rides");
  const Users = mongoose.connection.collection("users");
  const Ratings = mongoose.connection.collection("ratings");

  const [ayesha, zainab, fatima] = await Promise.all([login("ayesha@demo.com"), login("zainab@demo.com"), login("fatima@demo.com")]);
  check("demo accounts log in", ayesha && zainab && fatima);
  const users = await Users.find({ email: { $in: ["ayesha@demo.com", "zainab@demo.com", "fatima@demo.com"] } }).project({ _id: 1, email: 1 }).toArray();
  const fatimaId = users.find(u => u.email === "fatima@demo.com")._id;
  await Rides.updateMany({ $or: [{ passenger: { $in: users.map(u => u._id) } }, { driver: fatimaId }], status: { $in: ["requested", "accepted", "arrived", "in_progress"] } },
    { $set: { status: "cancelled", cancelReason: "Phase 6 test setup" } });

  const statsBefore = (await api(fatima, "GET", "/driver/stats")).body.stats;
  const drv = await connect(fatima);
  await api(fatima, "PUT", "/driver/online", { isOnline: true });
  drv.emit("driver:location", { coordinates: [74.3420, 31.4790] });
  await sleep(800);
  const pax = await connect(ayesha);

  // A full ride with a GPS track
  const runRide = async (token) => {
    const b = await api(token, "POST", "/rides", { pickupAddress: "DHA Phase 5", dropoffAddress: "Liberty Market", rideType: "economy", pickupCoordinates: DHA, dropoffCoordinates: LIBERTY });
    const id = b.body.ride?._id; createdRides.push(id);
    await waitFor(drv, "ride:incoming", p => String(p.rideId) === String(id));
    await api(fatima, "PUT", `/rides/${id}/accept`);
    await api(fatima, "PUT", `/rides/${id}/arrived`);
    await api(fatima, "POST", `/rides/${id}/verify-otp`, { otp: b.body.ride.otp });
    const route = (await api(token, "GET", `/rides/${id}`)).body.ride.plannedRoute;
    for (let i = 0; i < route.length; i += Math.max(1, Math.floor(route.length / 12))) {
      drv.emit("driver:location", { coordinates: route[i], rideIds: [id], accuracy: 10 });
      await sleep(150);
    }
    drv.emit("driver:location", { coordinates: route[route.length - 1], rideIds: [id], accuracy: 10 });
    // Wait until every point is stored (each one is a few database writes)
    const sent = Math.ceil(route.length / Math.max(1, Math.floor(route.length / 12))) + 1;
    for (let w = 0; w < 60; w++) {
      const doc = await Rides.findOne({ _id: new mongoose.Types.ObjectId(id) }, { projection: { routeCoordinates: 1 } });
      if ((doc?.routeCoordinates?.length || 0) >= sent) break;
      await sleep(250);
    }
    return { id, booked: b.body.ride };
  };

  console.log("\nScenario M — ride completion + fare settlement");
  const { id: rideId, booked } = await runRide(ayesha);
  const done = await api(fatima, "PUT", `/rides/${rideId}/complete`);
  const ride = done.body.ride || {};
  check("ride completes", done.status === 200, JSON.stringify(done.body).slice(0, 200));
  check("final distance from the GPS track", ride.distanceSource === "gps" && ride.distanceKm > 0, `${ride.distanceSource} ${ride.distanceKm}`);
  check("duration recorded", ride.durationMinutes >= 1);
  check("final fare calculated", ride.actualFare >= 50 && ride.fareBreakdown?.distanceFare > 0);
  const s = ride.settlement || {};
  check("settlement: payable = fare", s.payable === ride.farePerPassenger);
  check("settlement: commission = 15%", s.commission === Math.round(s.payable * 0.15) && s.commissionRate === 0.15);
  check("settlement: driver earning = payable − commission", s.driverEarning === s.payable - s.commission);
  check("cash payment starts as 'due'", s.method === "cash" && s.status === "due");

  console.log("\nPayment confirmation");
  check("passenger cannot confirm payment", (await api(ayesha, "PUT", `/rides/${rideId}/payment`, { status: "collected" })).status === 400);
  check("invalid status rejected", (await api(fatima, "PUT", `/rides/${rideId}/payment`, { status: "free" })).status === 400);
  const pay = await api(fatima, "PUT", `/rides/${rideId}/payment`, { status: "collected" });
  check("driver confirms cash collected", pay.status === 200 && pay.body.settlement.status === "collected" && !!pay.body.settlement.collectedAt);
  check("cannot confirm twice", (await api(fatima, "PUT", `/rides/${rideId}/payment`, { status: "collected" })).status === 400);
  check("passenger told payment was received", !!await waitFor(pax, "ride:payment-updated", p => String(p.rideId) === String(rideId)));

  console.log("\nRating");
  check("stars must be 1–5", (await api(ayesha, "POST", `/rides/${rideId}/rate`, { stars: 7 })).status === 400);
  check("driver cannot rate her own ride as passenger", (await api(fatima, "POST", `/rides/${rideId}/rate`, { stars: 5 })).status === 404);
  check("complaint needs a type", (await api(ayesha, "POST", `/rides/${rideId}/rate`, { stars: 2, hasComplaint: true, complaintType: "nonsense" })).status === 400);
  const rate = await api(ayesha, "POST", `/rides/${rideId}/rate`, {
    stars: 4, comment: "Safe and polite", tags: ["safe_driving", "polite", "made_up_tag"],
    categoryRatings: { safety: 5, professionalism: 4, cleanliness: 4, punctuality: 3, respectful: 5, extra: 5 },
  });
  check("rating saved", rate.status === 201, JSON.stringify(rate.body).slice(0, 200));
  check("only known behaviour tags kept", JSON.stringify(rate.body.rating?.tags) === JSON.stringify(["safe_driving", "polite"]));
  check("only known categories kept", rate.body.rating && !("extra" in rate.body.rating.categoryRatings) && rate.body.rating.categoryRatings.safety === 5);
  // Double submit at the same time → only one rating
  const [d1, d2] = await Promise.all([
    api(ayesha, "POST", `/rides/${rideId}/rate`, { stars: 1 }),
    api(ayesha, "POST", `/rides/${rideId}/rate`, { stars: 1 }),
  ]);
  check("rating twice is refused (even simultaneously)", d1.status === 400 && d2.status === 400);
  check("exactly one rating stored for the ride", (await Ratings.countDocuments({ ride: new mongoose.Types.ObjectId(rideId) })) === 1);

  // Second ride by another passenger → aggregate is a real average
  const { id: ride2 } = await runRide(zainab);
  await api(fatima, "PUT", `/rides/${ride2}/complete`);
  await api(zainab, "POST", `/rides/${ride2}/rate`, { stars: 2, tags: ["late"], categoryRatings: { safety: 3, punctuality: 1 },
    hasComplaint: true, complaintType: "rude_behaviour", complaintDetails: "test complaint" });
  const all = await Ratings.find({ ratedUser: fatimaId }).toArray();
  const expectedAvg = Math.round((all.reduce((a, r) => a + r.stars, 0) / all.length) * 100) / 100;
  const fatimaDoc = await Users.findOne({ _id: fatimaId });
  check("driver rating = real average of all her ratings", fatimaDoc.averageRating === expectedAvg && fatimaDoc.totalRatings === all.length, `${fatimaDoc.averageRating} vs ${expectedAvg}`);
  check("category averages stored", fatimaDoc.ratingSummary?.categories?.safety > 0);
  check("behaviour tag counts stored", fatimaDoc.ratingSummary?.tags?.safe_driving >= 1 && fatimaDoc.ratingSummary?.tags?.late >= 1);

  console.log("\nRide history");
  const hist = await api(ayesha, "GET", "/rides/my-rides?status=completed&limit=5");
  const row = hist.body.rides?.find(r => String(r._id) === String(rideId));
  check("passenger history lists the ride", hist.status === 200 && !!row);
  check("history shows date, pickup, destination", row && row.date && row.pickup === "DHA Phase 5" && row.dropoff === "Liberty Market");
  check("history shows driver + vehicle", row?.driver?.name && row.driver.licensePlate !== undefined && "vehicle" in row.driver);
  check("history shows fare, distance, duration, status, rating", row && row.fare === s.payable && row.distanceKm > 0 && row.durationMinutes >= 1 && row.status === "completed" && row.rating?.stars === 4);
  check("passenger sees payment status but not the commission", row?.settlement?.status === "collected" && row.settlement.commission === undefined);
  check("no private driver data in history", !JSON.stringify(hist.body).match(/cnicPhoto|licensePhoto|cnicNumber|\+92/));
  check("pagination info", hist.body.page === 1 && hist.body.limit === 5 && hist.body.total >= 1);
  check("status filter works", hist.body.rides.every(r => r.status === "completed"));
  const dh = await api(fatima, "GET", "/rides/my-rides?status=completed&limit=10");
  const drow = dh.body.rides?.find(r => String(r._id) === String(rideId));
  check("driver history shows passenger name and her earning", drow?.passenger?.name && drow.settlement?.driverEarning === s.driverEarning);
  check("driver history hides passenger phone", !JSON.stringify(dh.body).includes("+92"));
  check("driver does not see the passenger's comment", drow?.rating && drow.rating.comment === undefined);

  console.log("\nDriver statistics");
  const st = (await api(fatima, "GET", "/driver/stats")).body.stats;
  check("completed rides counted", st.totalRides === statsBefore.totalRides + 2, `${st.totalRides} vs ${statsBefore.totalRides}+2`);
  const r2 = await Rides.findOne({ _id: new mongoose.Types.ObjectId(ride2) });
  check("earnings are after commission", st.totalEarnings === statsBefore.totalEarnings + s.driverEarning + r2.settlement.driverEarning);
  check("today / week / month earnings include today's rides", st.todayEarnings >= s.driverEarning + r2.settlement.driverEarning && st.weekEarnings >= st.todayEarnings && st.monthEarnings >= st.todayEarnings);
  check("cash still due is tracked (2nd ride not collected)", st.cashDue >= r2.settlement.payable);
  check("daily breakdown for the chart", Array.isArray(st.daily) && st.daily.length >= 1);
  check("rating + categories + recent reviews from real data", st.averageRating === expectedAvg && st.ratingCategories.safety > 0 && st.recentReviews.length >= 2);
  check("acceptance rate computed from offers/declines", st.acceptanceRate === null || (st.acceptanceRate >= 0 && st.acceptanceRate <= 100));
  check("passenger cannot read driver stats", (await api(ayesha, "GET", "/driver/stats")).status === 403);

  // ── Cleanup: remove this run's ratings and recompute, so demo data stays clean ──
  const ids = createdRides.filter(Boolean).map(id => new mongoose.Types.ObjectId(id));
  await Ratings.deleteMany({ ride: { $in: ids } });
  await Rides.updateMany({ _id: { $in: ids } }, { $set: { rating: null } });
  await require("../services/ratings").recalcDriverRating(fatimaId);
  await api(fatima, "PUT", "/driver/online", { isOnline: false });
  sockets.forEach(x => x.close());
  await mongoose.disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  sockets.forEach(x => x.close());
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
