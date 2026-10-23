// services/emergency.js — the SOS workflow.
//
// start(): capture location, ride, passenger, driver, vehicle, route and
// destination into an EmergencySession; notify the reporter's emergency
// contacts with a live-location link; prepare the police incident payload;
// alert admins and the other person on the ride. Repeated SOS presses reuse
// the active session instead of creating duplicates.
//
// Nothing here claims a real dispatch that did not happen: contact messages
// carry the notifier's real status, and police.status stays "not_integrated"
// (or "simulated" in demo mode) unless POLICE_API_URL is configured.
const crypto = require("crypto");
const config = require("../config/appConfig");
const EmergencySession = require("../models/EmergencySession");
const Ride = require("../models/Ride");
const User = require("../models/User");
const realtime = require("./realtime");
const { notifyContacts } = require("./notifier");
const { driverVerification } = require("./verification");

const cfg = config.emergency;
const ACTIVE_RIDE = ["accepted", "arrived", "otp_verified", "in_progress"];

const validPoint = (c) =>
  Array.isArray(c) && c.length === 2 && c.every(n => typeof n === "number" && Number.isFinite(n)) &&
  Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;

const point = (coordinates, accuracy) =>
  validPoint(coordinates) ? { coordinates, accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : undefined, at: new Date() } : null;

const liveLink = (s) => {
  const path = `/api/emergency/live/${s.shareToken}`;
  return cfg.publicBaseUrl ? `${cfg.publicBaseUrl.replace(/\/$/, "")}${path}` : path;
};

const mapsLink = (p) => p ? `https://maps.google.com/?q=${p.coordinates[1]},${p.coordinates[0]}` : null;

// ── Incident payload (same shape a real emergency API would receive) ──────
const buildIncident = (reporter, ride, initial) => {
  const p = ride?.passenger, d = ride?.driver;
  const v = d ? driverVerification(d) : null;
  return {
    reporter: {
      id: String(reporter._id), role: reporter.role, name: reporter.name, phone: reporter.phone,
      emergencyContacts: (reporter.guardianContacts || []).filter(c => c.isActive)
        .map(c => ({ name: c.name, phone: c.phone, relation: c.relation || "" })),
    },
    passenger: p ? { id: String(p._id), name: p.name, phone: p.phone } : undefined,
    driver: d ? {
      id: String(d._id), name: d.name, phone: d.phone,
      verified: v.verified, verificationSource: v.source,
      vehicle: `${d.driverDetails?.vehicleMake || ""} ${d.driverDetails?.vehicleModel || ""}`.trim(),
      vehicleColor: d.driverDetails?.vehicleColor || "",
      licensePlate: d.driverDetails?.licensePlate || "",
    } : undefined,
    trip: ride ? {
      rideId: String(ride._id), status: ride.status,
      pickup:  { address: ride.pickupLocation?.address, coordinates: ride.pickupLocation?.coordinates },
      dropoff: { address: ride.dropoffLocation?.address, coordinates: ride.dropoffLocation?.coordinates },
      route:   { source: ride.preferredRoute?.source, distanceKm: ride.preferredRoute?.distanceKm || ride.distanceKm, durationMin: ride.preferredRoute?.durationMin },
      startedAt: ride.startedAt,
      routeDeviated: !!ride.routeDeviated,
      routeDeviationActive: !!ride.routeDeviationActive,
      safePoints: (ride.safePoints || []).map(s => ({ name: s.name, type: s.type, coordinates: s.coordinates })),
    } : undefined,
    initialLocation: initial,
    raisedAt: new Date(),
  };
};

const contactMessage = (s) => {
  const i = s.incident;
  const where = s.lastLocation ? mapsLink(s.lastLocation) : "location not available yet";
  return [
    `🆘 EMERGENCY — ${i.reporter.name} pressed SOS on Mehfooz Ride.`,
    `Live location: ${liveLink(s)}`,
    `Last known: ${where}`,
    i.driver?.name ? `Driver: ${i.driver.name}, ${i.driver.vehicle} ${i.driver.licensePlate}` : null,
    i.trip?.rideId ? `Ride ${i.trip.rideId.slice(-6)} to ${i.trip.dropoff?.address || "destination"}` : null,
    `Call Police ${cfg.policeNumber} if you cannot reach her.`,
  ].filter(Boolean).join("\n");
};

// Police: real only when an API is configured
const dispatchPolice = async (s) => {
  if (cfg.policeApiUrl) {
    try {
      const res = await fetch(cfg.policeApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: String(s._id), incident: s.incident, lastLocation: s.lastLocation }),
        signal: AbortSignal.timeout(10000),
      });
      return { status: res.ok ? "sent" : "failed", detail: `Police API responded ${res.status}`, at: new Date() };
    } catch (e) {
      return { status: "failed", detail: e.message, at: new Date() };
    }
  }
  return config.demoMode
    ? { status: "simulated", detail: `Demo mode: incident prepared, no police system connected. Call ${cfg.policeNumber} directly.`, at: new Date() }
    : { status: "not_integrated", detail: `No police integration configured. Call ${cfg.policeNumber} directly.`, at: new Date() };
};

// Short view sent to the app
const view = (s) => ({
  _id: s._id,
  status: s.status,
  startedAt: s.startedAt,
  resolvedAt: s.resolvedAt,
  demo: s.demo,
  ride: s.ride,
  lastLocation: s.lastLocation,
  locationCount: s.locations?.length || 0,
  liveLink: liveLink(s),
  liveLinkExpiresAt: s.shareExpiresAt,
  contactNotifications: s.contactNotifications,
  police: s.police,
  incident: s.incident,
});

// ── Start (or return the active one) ───────────────────────────────────────
const start = async ({ userId, rideId, coordinates, accuracy }) => {
  const reporter = await User.findById(userId).select("name phone role guardianContacts");
  if (!reporter || !["passenger", "driver"].includes(reporter.role)) {
    const e = new Error("Only passengers and drivers can raise SOS"); e.status = 403; throw e;
  }
  const loc = point(coordinates, accuracy);

  // Ride: the given one if she is on it, otherwise her current active ride
  const rideQuery = rideId
    ? { _id: rideId, $or: [{ passenger: userId }, { driver: userId }] }
    : { $or: [{ passenger: userId }, { driver: userId }], status: { $in: ACTIVE_RIDE } };
  const ride = await Ride.findOne(rideQuery).sort({ createdAt: -1 })
    .populate("passenger", "name phone guardianContacts")
    .populate("driver", "name phone isVerified cnicVerified driverDetails");
  if (rideId && !ride) { const e = new Error("Ride not found"); e.status = 404; throw e; }

  const existing = await EmergencySession.findOne({ raisedBy: userId, status: "active" });
  if (existing) {
    if (loc) await addLocation(existing, loc);
    return { session: existing, created: false };
  }

  const s = new EmergencySession({
    raisedBy: userId,
    raisedByRole: reporter.role,
    ride: ride?._id || null,
    demo: config.demoMode,
    locations: loc ? [loc] : [],
    lastLocation: loc,
    incident: buildIncident(reporter, ride, loc),
    shareToken: crypto.randomBytes(18).toString("base64url"),
    shareExpiresAt: new Date(Date.now() + cfg.liveLinkHours * 3600 * 1000),
  });

  await s.validate();   // never message contacts about a session that cannot be saved
  s.contactNotifications = await notifyContacts(s.incident.reporter.emergencyContacts, contactMessage(s));
  s.police = await dispatchPolice(s);
  await s.save();

  if (ride) {
    await Ride.updateOne({ _id: ride._id }, { sosActivated: true });
    // The other person on the ride (e.g. the driver) is told an SOS is active
    const other = String(ride.passenger?._id) === String(userId) ? ride.driver?._id : ride.passenger?._id;
    if (other) realtime.toUser(other, "sos:raised", { rideId: ride._id, byRole: reporter.role });
  }
  realtime.toAdmins("admin:sos-alert", { sessionId: s._id, ...s.incident, lastLocation: loc, timestamp: new Date() });
  return { session: s, created: true };
};

// ── Live trail ─────────────────────────────────────────────────────────────
const addLocation = async (s, loc) => {
  await EmergencySession.updateOne(
    { _id: s._id, status: "active" },
    { $push: { locations: { $each: [loc], $slice: -cfg.maxLocations } }, $set: { lastLocation: loc } }
  );
  s.lastLocation = loc;
  realtime.toAdmins("admin:sos-location", { sessionId: s._id, location: loc });
};

const updateLocation = async ({ userId, sessionId, coordinates, accuracy }) => {
  const s = await EmergencySession.findOne({ _id: sessionId, raisedBy: userId });
  if (!s) { const e = new Error("Emergency session not found"); e.status = 404; throw e; }
  if (s.status !== "active") { const e = new Error("This emergency session has ended"); e.status = 409; throw e; }
  const loc = point(coordinates, accuracy);
  if (!loc) { const e = new Error("Valid coordinates [lng, lat] are required"); e.status = 400; throw e; }
  await addLocation(s, loc);
  return s;
};

const resolve = async ({ userId, sessionId, note }) => {
  const s = await EmergencySession.findOneAndUpdate(
    { _id: sessionId, raisedBy: userId, status: "active" },
    { status: "resolved", resolvedAt: new Date(), resolvedNote: String(note || "Marked safe by user").slice(0, 300) },
    { new: true }
  );
  if (!s) { const e = new Error("No active emergency session"); e.status = 404; throw e; }
  // Tell contacts she is safe (same channel, same honesty about delivery)
  const safeMsg = `✅ ${s.incident.reporter.name} marked herself SAFE on Mehfooz Ride.`;
  const results = await notifyContacts(s.incident.reporter.emergencyContacts, safeMsg);
  await EmergencySession.updateOne({ _id: s._id }, { $push: { contactNotifications: { $each: results } } });
  s.contactNotifications.push(...results);
  realtime.toAdmins("admin:sos-resolved", { sessionId: s._id });
  return s;
};

// Public, read-only view for the live link (no phone numbers)
const publicView = (s) => ({
  name: s.incident.reporter.name,
  status: s.status,
  startedAt: s.startedAt,
  resolvedAt: s.resolvedAt,
  lastLocation: s.lastLocation,
  trail: (s.locations || []).slice(-200).map(p => [p.coordinates[1], p.coordinates[0]]),
  driver: s.incident.driver?.name ? { name: s.incident.driver.name, vehicle: s.incident.driver.vehicle, licensePlate: s.incident.driver.licensePlate } : null,
  destination: s.incident.trip?.dropoff?.address || null,
  demo: s.demo,
});

module.exports = { start, updateLocation, resolve, view, publicView, liveLink };
