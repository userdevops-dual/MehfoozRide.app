// tests/phase2.api.test.js — maps, routes and booking with a chosen route (Phase 2)
// Runs against a running backend:  node tests/phase2.api.test.js [http://localhost:5000]
// Needs internet (OpenStreetMap Nominatim + OSRM) and the seeded demo passenger.
// Any ride it books is cancelled at the end.
const BASE = (process.argv[2] || "http://localhost:5000") + "/api";
let passed = 0, failed = 0, token = "";
const booked = [];

const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else    { failed++; console.log(`  ❌ ${name} ${detail}`); }
};
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
};

// DHA Phase 5 → Liberty Market (Lahore), as [lng, lat]
const PICKUP  = [74.3436, 31.4804];
const DROPOFF = [74.3462, 31.5118];

(async () => {
  const login = await call("POST", "/auth/login", { email: "ayesha@demo.com", password: "password123" });
  token = login.body.token;
  check("demo passenger logs in", !!token);

  console.log("\nAccess control");
  {
    const saved = token; token = "";
    const r = await call("GET", "/geo/search?q=gulberg");
    check("geo requires login", r.status === 401);
    token = saved;
  }

  console.log("\nPlace search + reverse geocoding (Nominatim)");
  const s = await call("GET", "/geo/search?q=liberty%20market&lat=31.5204&lng=74.3587");
  check("search finds Liberty Market in Lahore", s.body.success && s.body.places.some(p => /liberty/i.test(p.name) && Math.abs(p.lat - 31.51) < 0.05), JSON.stringify(s.body).slice(0, 200));
  check("duplicate results merged", new Set(s.body.places.map(p => p.name)).size === s.body.places.length);
  check("too-short search rejected", (await call("GET", "/geo/search?q=ab")).status === 400);
  const rev = await call("GET", "/geo/reverse?lat=31.4804&lng=74.3436");
  check("reverse geocoding returns an address", rev.body.success && rev.body.place.address.length > 5);
  check("invalid coordinates rejected", (await call("GET", "/geo/reverse?lat=abc&lng=74")).status === 400);

  console.log("\nScenario F — real routes + server fare");
  const est = await call("POST", "/rides/estimate", { pickupCoordinates: PICKUP, dropoffCoordinates: DROPOFF });
  const routes = est.body.routes || [];
  check("estimate returns real road routes (OSRM)", est.body.success && est.body.source === "osrm" && routes.length >= 1, JSON.stringify(est.body).slice(0, 200));
  check("routes have distance, time and geometry", routes.every(r => r.distanceKm > 1 && r.durationMin > 0 && r.coordinates.length > 10));
  check("fare = 80 + 25/km + 5/min", routes.every(r => r.fare.total === Math.round(Math.max(80 + r.distanceKm * 25 + r.durationMin * 5, 50))));
  {
    const ac = await call("POST", "/rides/estimate", { pickupCoordinates: PICKUP, dropoffCoordinates: DROPOFF, rideType: "ac" });
    check("AC ride type adds Rs 50", ac.body.routes[0].fare.total === routes[0].fare.total + 50);
  }

  console.log("\nValidation");
  check("outside Pakistan rejected", (await call("POST", "/rides/estimate", { pickupCoordinates: [0, 0], dropoffCoordinates: DROPOFF })).status === 400);
  check("same pickup and destination rejected", (await call("POST", "/rides/estimate", { pickupCoordinates: PICKUP, dropoffCoordinates: PICKUP })).status === 400);
  check("missing coordinates rejected", (await call("POST", "/rides/estimate", {})).status === 400);

  console.log("\nBooking stores the passenger's chosen route");
  const pick = routes.length > 1 ? 1 : 0;
  const book = await call("POST", "/rides", {
    pickupAddress: "DHA Phase 5", pickupCoordinates: PICKUP,
    dropoffAddress: "Liberty Market", dropoffCoordinates: DROPOFF,
    routeIndex: pick, distanceKm: 0.1, // a fake client distance must be ignored
  });
  if (book.body.ride?._id) booked.push(book.body.ride._id);
  const pr = book.body.ride?.preferredRoute || {};
  check("ride booked", book.status === 201, JSON.stringify(book.body).slice(0, 200));
  check(`chosen route saved (index ${pick})`, pr.index === pick && pr.source === "osrm" && pr.coordinates?.length > 10);
  check("distance from the server route, not the client", book.body.ride?.distanceKm === routes[pick].distanceKm);
  check("fare matches the estimate for that route", book.body.ride?.estimatedFare === routes[pick].fare.total);

  for (const id of booked) await call("PUT", `/rides/${id}/cancel`, { reason: "API test cleanup" });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
