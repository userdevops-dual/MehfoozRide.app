// services/matching.js — driver matching, ride pooling and request expiry.
//
// Driver matching: a requested ride (or the "lead" ride of an open pool) is
// offered to the nearest eligible drivers: female, verified, online, not
// suspended, not on another trip, with a recent GPS fix, within the search
// radius, and not drivers who already declined it. The server sends the
// offer itself (it does not depend on the passenger's app).
//
// Pooling: only passengers who opted in are matched, only with the same
// vehicle type, and only when pickup, drop-off and direction of travel are
// all compatible with every passenger already in the pool.
const mongoose = require("mongoose");
const Ride     = require("../models/Ride");
const User     = require("../models/User");
const RidePool = require("../models/RidePool");
const config   = require("../config/appConfig");
const FARE     = require("../config/fare");
const realtime = require("./realtime");
const { poolShares } = require("./fare");
const { haversine } = require("../utils/routeDeviation");

const M = config.matching;
const P = FARE.pool;
const BUSY_STATUSES = ["accepted", "arrived", "otp_verified", "in_progress"];

const toLatLng = ([lng, lat]) => ({ lat, lng });

// Compass bearing (degrees) from a → b
const bearing = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
            Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
const angleDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// ── Pool compatibility between two rides ─────────────────────────────────────
// → { ok, pickupKm } — checks pickup proximity, drop-off proximity and direction
const compatible = (a, b) => {
  if (a.rideType !== b.rideType) return { ok: false };
  const aP = toLatLng(a.pickupLocation.coordinates), aD = toLatLng(a.dropoffLocation.coordinates);
  const bP = toLatLng(b.pickupLocation.coordinates), bD = toLatLng(b.dropoffLocation.coordinates);
  const pickupKm  = haversine(aP.lat, aP.lng, bP.lat, bP.lng);
  const dropoffKm = haversine(aD.lat, aD.lng, bD.lat, bD.lng);
  const dir = angleDiff(bearing(aP, aD), bearing(bP, bD));
  return {
    ok: pickupKm <= P.maxPickupDistanceKm && dropoffKm <= P.maxDropoffDistanceKm && dir <= P.maxDirectionDifferenceDeg,
    pickupKm,
  };
};

// ── Driver search ────────────────────────────────────────────────────────────
const findEligibleDrivers = async (pickupLngLat, excludeIds = []) => {
  const busy = await Ride.distinct("driver", { status: { $in: BUSY_STATUSES }, driver: { $ne: null } });
  return User.find({
    role: "driver", gender: "female",
    isVerified: true, isOnline: true, isSuspended: false,
    locationUpdatedAt: { $gte: new Date(Date.now() - M.driverLocationMaxAgeSec * 1000) },
    _id: { $nin: [...excludeIds, ...busy] },
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: pickupLngLat },
        $maxDistance: M.searchRadiusKm * 1000,
      },
    },
  }).limit(M.maxDriversNotified).select("_id location");
};

// Rides a driver would take if she accepts `lead` (the whole pool, or just the ride)
const ridesForOffer = async (lead) => {
  if (!lead.pool) return [lead];
  return Ride.find({ pool: lead.pool, status: "requested" })
    .populate("passenger", "name averageRating totalRatings")
    .sort({ createdAt: 1 });
};

// What the driver sees in the request
const offerPayload = async (lead) => {
  const rides = await ridesForOffer(lead);
  const first = (name) => String(name || "Passenger").split(" ")[0];
  const stops = rides.map(r => ({
    rideId:          r._id,
    passengerName:   first(r.passenger?.name),
    passengerRating: r.passenger?.totalRatings ? r.passenger.averageRating : null,
    pickupAddress:   r.pickupLocation.address,
    pickupCoordinates:  r.pickupLocation.coordinates,
    dropoffAddress:  r.dropoffLocation.address,
    dropoffCoordinates: r.dropoffLocation.coordinates,
    fare:            r.isPooled && r.pool ? r.farePerPassenger : r.estimatedFare,
    distanceKm:      r.distanceKm,
    durationMin:     r.estimatedDurationMinutes,
    moodPreference:  r.moodPreference,
  }));
  return {
    rideId:        lead._id,                 // accept/decline this id
    isPooled:      stops.length > 1,
    passengers:    stops.length,
    stops,
    rideType:      lead.rideType,
    totalFare:     stops.reduce((n, s) => n + (s.fare || 0), 0),
    expiresAt:     lead.requestExpiresAt,
    // first stop, for older screens
    ...stops[0],
  };
};

// ── Offer a request to drivers who have not seen it yet ──────────────────────
const offerToDrivers = async (leadId) => {
  const lead = await Ride.findById(leadId).populate("passenger", "name averageRating totalRatings");
  if (!lead || lead.status !== "requested" || lead.driver) return 0;
  if (lead.requestExpiresAt && lead.requestExpiresAt < new Date()) return 0;

  const exclude = [...lead.offeredTo, ...lead.declinedBy, lead.passenger._id];
  const drivers = await findEligibleDrivers(lead.pickupLocation.coordinates, exclude);
  if (!drivers.length) return 0;

  const payload = await offerPayload(lead);
  for (const d of drivers) {
    const [dLng, dLat] = d.location.coordinates;
    const [pLng, pLat] = lead.pickupLocation.coordinates;
    realtime.toUser(d._id, "ride:incoming", { ...payload, driverDistanceKm: Math.round(haversine(dLat, dLng, pLat, pLng) * 10) / 10 });
  }
  await Ride.updateOne({ _id: lead._id }, { $addToSet: { offeredTo: { $each: drivers.map(d => d._id) } } });
  return drivers.length;
};

// Re-send the (changed) request to drivers who already have it — e.g. a pool
// gained or lost a passenger. Drivers who declined are not contacted again.
const refreshOffer = async (leadId) => {
  const lead = await Ride.findById(leadId);
  if (!lead || lead.status !== "requested" || lead.driver) return 0;
  const declined = new Set(lead.declinedBy.map(String));
  const targets = lead.offeredTo.filter(id => !declined.has(String(id)));
  if (!targets.length) return 0;
  const payload = await offerPayload(lead);
  for (const id of targets) realtime.toUser(id, "ride:incoming", { ...payload, updated: true });
  return targets.length;
};

// Tell drivers who saw the request that it is gone (accepted elsewhere / cancelled / expired)
const withdrawOffer = (ride, reason) => {
  for (const id of ride.offeredTo || []) realtime.toUser(id, "ride:request-withdrawn", { rideId: ride._id, reason });
};

// ── Pool shares ──────────────────────────────────────────────────────────────
// Recalculate every member's share and notify the passengers
const repricePool = async (poolId) => {
  const pool = await RidePool.findById(poolId);
  if (!pool) return null;
  const rides = await Ride.find({ _id: { $in: pool.rides }, status: { $nin: ["cancelled", "completed"] } });

  if (rides.length < 2) {
    // Pool dissolved — the remaining passenger goes back to her solo fare
    for (const r of rides) {
      await Ride.updateOne({ _id: r._id }, { pool: null, farePerPassenger: r.soloFare || r.estimatedFare });
      realtime.toUser(r.passenger, "ride:pool-updated", {
        rideId: r._id, pooled: false, passengers: 1, yourFare: r.soloFare || r.estimatedFare, soloFare: r.soloFare || r.estimatedFare,
        message: "The other passenger left the pool. You now pay the normal fare.",
      });
    }
    pool.status = "closed";
    pool.rides = rides.map(r => r._id);
    await pool.save();
    return null;
  }

  const { vehicleTotal, shares } = poolShares(rides.map(r => ({
    id: r._id, distanceKm: r.distanceKm, durationMin: r.estimatedDurationMinutes, rideType: r.rideType,
  })));
  for (const r of rides) {
    const s = shares[String(r._id)];
    await Ride.updateOne({ _id: r._id }, { farePerPassenger: s.share, soloFare: s.solo });
    realtime.toUser(r.passenger, "ride:pool-updated", {
      rideId: r._id, pooled: true, passengers: rides.length,
      yourFare: s.share, soloFare: s.solo, saving: s.saving,
      message: `Pool matched with ${rides.length - 1} other verified passenger${rides.length > 2 ? "s" : ""}. Your fare is now Rs ${s.share}.`,
    });
  }
  pool.vehicleTotal = vehicleTotal;
  pool.rides = rides.map(r => r._id);
  await pool.save();
  return { vehicleTotal, shares, passengers: rides.length };
};

// ── Try to put a newly booked (consenting) ride into a pool ──────────────────
// → { poolId, passengers } or null
const tryPool = async (ride) => {
  if (!ride.isPooled) return null;
  const since = new Date(Date.now() - P.matchWindowMinutes * 60 * 1000);

  // Candidates: open pools, and single consenting requests not yet pooled
  const pools = await RidePool.find({ status: "open", updatedAt: { $gte: since } });
  const singles = await Ride.find({
    _id: { $ne: ride._id }, status: "requested", isPooled: true, pool: null, driver: null,
    passenger: { $ne: ride.passenger }, rideType: ride.rideType, createdAt: { $gte: since },
  });

  let best = null;
  for (const pool of pools) {
    const members = await Ride.find({ _id: { $in: pool.rides }, status: "requested", driver: null });
    if (!members.length || members.length >= P.maxPassengers) continue;
    if (members.some(m => String(m.passenger) === String(ride.passenger))) continue;
    const checks = members.map(m => compatible(m, ride));
    if (checks.every(c => c.ok)) {
      const km = Math.min(...checks.map(c => c.pickupKm));
      if (!best || km < best.km) best = { km, pool, members };
    }
  }
  for (const single of singles) {
    const c = compatible(single, ride);
    if (c.ok && (!best || c.pickupKm < best.km)) best = { km: c.pickupKm, single };
  }
  if (!best) return null;

  let pool = best.pool;
  if (!pool) {
    pool = await RidePool.create({ rides: [best.single._id], status: "open", maxPassengers: P.maxPassengers });
    await Ride.updateOne({ _id: best.single._id }, { pool: pool._id });
  }
  // Join (guarded so a pool never exceeds the maximum)
  const joined = await RidePool.findOneAndUpdate(
    { _id: pool._id, status: "open", [`rides.${P.maxPassengers - 1}`]: { $exists: false } },
    { $addToSet: { rides: ride._id } },
    { new: true }
  );
  if (!joined) return null;
  await Ride.updateOne({ _id: ride._id }, { pool: pool._id });

  // Everyone in the pool now shares the latest expiry time
  const expiresAt = new Date(Date.now() + M.requestTimeoutSeconds * 1000);
  await Ride.updateMany({ pool: pool._id, status: "requested" }, { requestExpiresAt: expiresAt });

  const priced = await repricePool(pool._id);
  // Drivers who already have the pool's request see the new passenger count
  const lead = await leadRideOf(await Ride.findById(ride._id));
  await refreshOffer(lead._id);
  return priced ? { poolId: pool._id, passengers: priced.passengers } : null;
};

// The ride that represents a pool in driver offers (oldest still-requested member)
const leadRideOf = async (ride) => {
  if (!ride.pool) return ride;
  return (await Ride.findOne({ pool: ride.pool, status: "requested" }).sort({ createdAt: 1 })) || ride;
};

// ── A ride leaves its pool (cancelled / expired) ─────────────────────────────
const leavePool = async (ride) => {
  if (!ride.pool) return;
  await RidePool.updateOne({ _id: ride.pool }, { $pull: { rides: ride._id } });
  await repricePool(ride.pool);
  // Still waiting for a driver → drivers who have the request see the smaller group
  const remaining = await Ride.findOne({ status: "requested", $or: [{ pool: ride.pool }, { _id: { $in: (await RidePool.findById(ride.pool))?.rides || [] } }] }).sort({ createdAt: 1 });
  if (remaining) await refreshOffer((await leadRideOf(remaining))._id);
};

// ── Expire requests nobody accepted ──────────────────────────────────────────
const expireRequests = async (extraFilter = {}) => {
  const expired = await Ride.find({ status: "requested", requestExpiresAt: { $lt: new Date() }, ...extraFilter });
  for (const ride of expired) {
    const res = await Ride.updateOne(
      { _id: ride._id, status: "requested" },
      { status: "cancelled", cancelledAt: new Date(), cancelReason: "System: no driver accepted the request in time" }
    );
    if (!res.modifiedCount) continue;
    withdrawOffer(ride, "expired");
    await leavePool(ride);
    realtime.toUser(ride.passenger, "ride:expired", {
      rideId: ride._id,
      message: "No driver accepted your request in time. You have not been charged — please try again.",
    });
  }
  return expired.length;
};

// ── Background sweeper: expire old requests, offer open ones to newly available drivers
let sweeper = null;
const startSweeper = () => {
  if (sweeper) return;
  sweeper = setInterval(async () => {
    if (mongoose.connection.readyState !== 1) return;
    try {
      await expireRequests();
      const open = await Ride.find({ status: "requested", driver: null, requestExpiresAt: { $gt: new Date() } }).select("_id pool createdAt");
      const leads = new Map();
      for (const r of open) {
        const key = r.pool ? String(r.pool) : String(r._id);
        if (!leads.has(key)) leads.set(key, (await leadRideOf(r))._id);
      }
      for (const id of leads.values()) await offerToDrivers(id);
    } catch (e) {
      console.error("Matching sweeper error:", e.message);
    }
  }, M.sweepIntervalSeconds * 1000);
};

module.exports = {
  offerToDrivers, refreshOffer, withdrawOffer, offerPayload, tryPool, repricePool, leavePool,
  leadRideOf, expireRequests, startSweeper, compatible, BUSY_STATUSES,
};
