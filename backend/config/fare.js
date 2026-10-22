// config/fare.js — every fare rule in one place. Change prices here only.
module.exports = {
  currency: "PKR",

  baseFare:      80,    // Rs, every ride
  perKm:         25,    // Rs per km
  perMinute:     5,     // Rs per minute
  minimumFare:   50,    // Rs, a single passenger never pays less

  // Added to (or taken off) the fare by vehicle type
  rideTypeSurcharge: { economy: 0, ac: 50, bike: -50 },

  // Used when the routing service is unavailable
  fallback: {
    roadDistanceFactor: 1.3,  // straight-line km × this ≈ road km
    minutesPerKm:       3.5,  // Lahore city average
  },

  // Final fare: actual GPS distance is used when it looks complete; otherwise
  // the planned route distance (GPS gaps would otherwise undercharge).
  actualDistance: {
    minShareOfPlanned: 0.6,   // GPS track must cover at least 60% of the planned km
    maxShareOfPlanned: 2.0,   // ignore GPS glitches above 2× planned
  },

  // Ride pooling (only between passengers who opted in)
  pool: {
    maxPassengers:          3,
    // Total vehicle fare = fare of the longest member trip × (1 + detour × extra passengers)
    detourAllowancePerExtra: 0.15,
    // Each passenger pays a share in proportion to her own trip's solo fare,
    // never more than her solo fare and never less than this minimum
    minimumShare:            50,
    // Matching rules
    maxPickupDistanceKm:     1.5,
    maxDropoffDistanceKm:    2.5,
    maxDirectionDifferenceDeg: 35,
    matchWindowMinutes:      5,   // only join requests booked in the last few minutes
  },

  // Platform commission (Phase 6 — driver earnings)
  commissionRate: 0.15,
};
