// services/fare.js — fare calculations (rules come from config/fare.js)
const FARE = require("../config/fare");
const { haversine } = require("../utils/routeDeviation");

const round = (n) => Math.round(n);

const validRideType = (t) => (FARE.rideTypeSurcharge[t] !== undefined ? t : "economy");

// Solo fare for one passenger
// → { baseFare, distanceFare, timeFare, surcharge, total, distanceKm, durationMin }
const soloFare = (distanceKm, durationMin = 0, rideType = "economy") => {
  const surcharge    = FARE.rideTypeSurcharge[validRideType(rideType)];
  const distanceFare = distanceKm * FARE.perKm;
  const timeFare     = durationMin * FARE.perMinute;
  const total        = Math.max(FARE.baseFare + distanceFare + timeFare + surcharge, FARE.minimumFare);
  return {
    baseFare: FARE.baseFare,
    distanceFare: round(distanceFare),
    timeFare: round(timeFare),
    surcharge,
    total: round(total),
    distanceKm, durationMin,
  };
};

// Pooled fares for a group of trips.
// trips: [{ id, distanceKm, durationMin, rideType }]
// → { vehicleTotal, shares: { [id]: { solo, share, saving } } }
const poolShares = (trips) => {
  const solos = trips.map(t => ({ id: String(t.id), fare: soloFare(t.distanceKm, t.durationMin, t.rideType) }));
  if (solos.length < 2) {
    const s = solos[0];
    return { vehicleTotal: s ? s.fare.total : 0, shares: s ? { [s.id]: { solo: s.fare.total, share: s.fare.total, saving: 0 } } : {} };
  }
  const longest  = Math.max(...solos.map(s => s.fare.total));
  const vehicle  = longest * (1 + FARE.pool.detourAllowancePerExtra * (solos.length - 1));
  const soloSum  = solos.reduce((n, s) => n + s.fare.total, 0);
  const shares = {};
  for (const s of solos) {
    const proportional = vehicle * (s.fare.total / soloSum);
    const share = round(Math.min(s.fare.total, Math.max(FARE.pool.minimumShare, proportional)));
    shares[s.id] = { solo: s.fare.total, share, saving: s.fare.total - share };
  }
  return { vehicleTotal: round(vehicle), shares };
};

// What a passenger would pay if one other passenger with a similar trip joined
const poolEstimateFor = (distanceKm, durationMin, rideType) => {
  const { shares } = poolShares([
    { id: "me",    distanceKm, durationMin, rideType },
    { id: "other", distanceKm, durationMin, rideType },
  ]);
  return shares.me.share;
};

// Distance actually driven from the recorded GPS track ([{ coordinates: [lng, lat] }])
const trackDistanceKm = (track = []) => {
  let km = 0;
  for (let i = 1; i < track.length; i++) {
    const [lng1, lat1] = track[i - 1].coordinates || [];
    const [lng2, lat2] = track[i].coordinates || [];
    if ([lat1, lng1, lat2, lng2].every(Number.isFinite)) km += haversine(lat1, lng1, lat2, lng2);
  }
  return Math.round(km * 10) / 10;
};

// Choose the distance to bill: GPS track if it looks complete, else the planned route
// → { distanceKm, source: "gps" | "planned" }
const billableDistance = (plannedKm, track) => {
  const gpsKm = trackDistanceKm(track);
  const { minShareOfPlanned, maxShareOfPlanned } = FARE.actualDistance;
  if (plannedKm > 0 && gpsKm >= plannedKm * minShareOfPlanned && gpsKm <= plannedKm * maxShareOfPlanned) {
    return { distanceKm: gpsKm, source: "gps" };
  }
  return { distanceKm: plannedKm, source: "planned" };
};

module.exports = { FARE, soloFare, poolShares, poolEstimateFor, trackDistanceKm, billableDistance, validRideType };
