// services/routeMonitor.js — compares the driver's live GPS with the route the
// passenger chose (preferredRoute) and reports deviation + trip progress.
//
// A mapping provider cannot "lock" a driver to a road, so this is monitoring:
// a deviation is only declared after several consecutive readings are further
// than the threshold from the route, and inaccurate GPS fixes are ignored,
// so normal GPS jitter does not cause false alerts.
const { routeMonitor: cfg } = require("../config/appConfig");

const R = 6371000; // metres
const toRad = d => (d * Math.PI) / 180;

// Local equirectangular projection around a reference latitude — accurate to
// well under 1 % over city distances, and lets us do plain 2-D geometry.
const project = ([lng, lat], refLat) => [
  toRad(lng) * Math.cos(toRad(refLat)) * R,
  toRad(lat) * R,
];

const distM = (a, b) => {
  const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// The planned line: the chosen road route, or pickup → drop-off when routing was unavailable.
const plannedLine = ride => {
  const c = ride.preferredRoute?.coordinates;
  if (Array.isArray(c) && c.length >= 2) return c;
  return [ride.pickupLocation.coordinates, ride.dropoffLocation.coordinates];
};

// Nearest point on the polyline: distance from it (m) and distance along the route to it (m).
const locate = (point, line) => {
  const refLat = point[1];
  const p = project(point, refLat);
  let best = { offM: Infinity, alongM: 0 }, walked = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = project(line[i], refLat), b = project(line[i + 1], refLat);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    const off = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    const segLen = Math.sqrt(len2);
    if (off < best.offM) best = { offM: off, alongM: walked + t * segLen };
    walked += segLen;
  }
  return { ...best, totalM: walked };
};

// Progress + ETA along the planned route from the driver's position.
const progressOf = (ride, point) => {
  const line = plannedLine(ride);
  const { offM, alongM, totalM } = locate(point, line);
  const remainingKm = Math.max(0, totalM - alongM) / 1000;
  const plannedKm = ride.preferredRoute?.distanceKm || totalM / 1000;
  const plannedMin = ride.preferredRoute?.durationMin || ride.estimatedDurationMinutes || plannedKm * 3.5;
  const minPerKm = plannedKm > 0 ? plannedMin / plannedKm : 3.5;
  return {
    offRouteM: Math.round(offM),
    remainingKm: Math.round(remainingKm * 10) / 10,
    progressPct: totalM > 0 ? Math.round((alongM / totalM) * 100) : 0,
    etaMin: Math.max(1, Math.round(remainingKm * minPerKm)),
    routeSource: ride.preferredRoute?.coordinates?.length >= 2 ? ride.preferredRoute.source : "straight_line",
  };
};

// Per-ride consecutive counters (in memory — a restart only delays an alert by a few readings).
const streaks = new Map();

/**
 * Feed one GPS reading. Returns { progress, event } where event is
 * "deviated" (just crossed into deviation), "back_on_route", or null.
 * accuracyM: the device's reported accuracy, if any.
 */
const check = (ride, point, accuracyM) => {
  const progress = progressOf(ride, point);
  const id = String(ride._id);
  const s = streaks.get(id) || { off: 0, on: 0 };

  // Straight-line fallback is not a real road, so allow far more room.
  const threshold = progress.routeSource === "straight_line" ? cfg.straightLineThresholdMeters : cfg.deviationThresholdMeters;
  const reliable = !(accuracyM > cfg.maxGpsAccuracyMeters);

  let event = null;
  if (reliable) {
    if (progress.offRouteM > threshold) { s.off += 1; s.on = 0; }
    else if (progress.offRouteM < threshold * 0.6) { s.on += 1; s.off = 0; }   // hysteresis

    const deviating = !!ride.routeDeviationActive;
    if (!deviating && s.off >= cfg.consecutiveReadings) event = "deviated";
    if (deviating && s.on >= cfg.consecutiveReadings) event = "back_on_route";
  }
  streaks.set(id, s);
  return { progress: { ...progress, thresholdM: threshold, gpsReliable: reliable }, event };
};

const forget = rideId => streaks.delete(String(rideId));

module.exports = { check, progressOf, locate, plannedLine, distM, forget };
