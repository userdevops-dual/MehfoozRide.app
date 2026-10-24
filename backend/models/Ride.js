// ─────────────────────────────────────────
//  models/Ride.js — with OTP failure tracking, farePerPassenger
// ─────────────────────────────────────────

const mongoose = require("mongoose");

const RideSchema = new mongoose.Schema(
  {
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    driver:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // isPooled = passenger consented to pooling; pool = the group she was matched into (if any)
    isPooled: { type: Boolean, default: false },
    pool:     { type: mongoose.Schema.Types.ObjectId, ref: "RidePool", default: null },
    soloFare: { type: Number, default: 0 },   // what this trip costs alone (pool share is compared to it)
    poolPassengers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    maxPoolSize: { type: Number, default: 1 },

    // Driver matching
    requestExpiresAt: { type: Date },
    offeredTo:  [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    declinedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Final fare basis: "gps" (recorded track) or "planned" (route chosen at booking)
    billedDistanceKm: { type: Number, default: 0 },
    distanceSource:   { type: String, enum: ["gps", "planned", ""], default: "" },

    pickupLocation: {
      address: { type: String, required: true },
      coordinates: { type: [Number], required: true },
    },
    dropoffLocation: {
      address: { type: String, required: true },
      coordinates: { type: [Number], required: true },
    },

    estimatedFare:   { type: Number, required: true },
    actualFare:      { type: Number, default: 0 },
    farePerPassenger: { type: Number, default: 0 },
    fareBreakdown: {
      baseFare:     { type: Number, default: 80 },
      distanceFare: { type: Number, default: 0 },
      timeFare:     { type: Number, default: 0 },
      discount:     { type: Number, default: 0 },
    },

    distanceKm:      { type: Number, default: 0 },
    durationMinutes: { type: Number, default: 0 },
    estimatedDurationMinutes: { type: Number, default: 0 },

    // Route the passenger chose before booking (used for route monitoring).
    // source "osrm" = real road route; "straight_line" = fallback when routing was unavailable.
    preferredRoute: {
      source:      { type: String, enum: ["osrm", "straight_line"], default: "straight_line" },
      index:       { type: Number, default: 0 },
      distanceKm:  { type: Number, default: 0 },
      durationMin: { type: Number, default: 0 },
      summary:     { type: String, default: "" },
      coordinates: { type: [[Number]], default: undefined },   // [[lng, lat], ...]
    },

    rideType: {
      type: String,
      enum: ['economy', 'ac', 'bike'],
      default: 'economy',
    },
    moodPreference: {
      type: String,
      // "friendly" kept only so rides booked before Phase 3 still load
      enum: ["talkative", "quiet", "introvert", "friendly"],
      default: "quiet",
    },

    // select: false — the OTP must never reach the driver; only bookRide returns it to the passenger
    otp:         { type: String, required: true, select: false },
    otpVerified: { type: Boolean, default: false },

    // ── Fake Ride Detection ───────────────────────────────────────────────
    otpFailureCount: { type: Number, default: 0 },  // wrong OTP attempts
    fakeRideSuspected: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["requested", "accepted", "arrived", "otp_verified", "in_progress", "completed", "cancelled"],
      default: "requested",
    },
    cancelReason: { type: String, default: "" },
    cancelledBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    requestedAt:  { type: Date, default: Date.now },
    acceptedAt:   { type: Date },
    arrivedAt:    { type: Date },
    startedAt:    { type: Date },
    completedAt:  { type: Date },
    cancelledAt:  { type: Date },

    routeCoordinates: [{ coordinates: [Number], timestamp: Date }],

    sosActivated:  { type: Boolean, default: false },
    routeDeviated: { type: Boolean, default: false },        // deviated at any point in the trip
    routeDeviationActive: { type: Boolean, default: false }, // off-route right now
    // Each episode of leaving the chosen route (services/routeMonitor.js)
    routeDeviations: [
      {
        startedAt:     { type: Date },
        endedAt:       { type: Date },
        startLocation: { type: [Number] },   // [lng, lat]
        maxOffRouteM:  { type: Number, default: 0 },
        thresholdM:    { type: Number },
      },
    ],
    // Safe points the passenger marked for this trip (real map locations)
    safePoints: [
      {
        name:        { type: String, required: true },
        type:        { type: String, enum: ["police", "hospital", "public", "other"], default: "other" },
        address:     { type: String, default: "" },
        coordinates: { type: [Number], required: true },   // [lng, lat]
        source:      { type: String, enum: ["osm", "search", "map"], default: "map" },
        addedAt:     { type: Date, default: Date.now },
      },
    ],
    // Passenger asked to be taken to one of them
    safePointRequest: {
      pointId:     { type: mongoose.Schema.Types.ObjectId },
      requestedAt: { type: Date },
      acknowledgedAt: { type: Date },
    },
    lastProgress: {
      remainingKm: Number, progressPct: Number, etaMin: Number, offRouteM: Number, at: Date,
    },

    // ── Guardian notifications log ────────────────────────────────────────
    guardianNotifications: [
      {
        event:     { type: String },  // "ride_booked", "driver_assigned", "ride_started", "ride_completed", "sos"
        sentAt:    { type: Date, default: Date.now },
        contacts:  [{ name: String, phone: String }],
      },
    ],

    rating: { type: mongoose.Schema.Types.ObjectId, ref: "Rating", default: null },

    // ── Fare settlement (set when the ride is completed) ─────────────────
    // payable: what the passenger pays · commission: platform share ·
    // driverEarning: payable − commission. Payment is cash in this version;
    // the driver confirms she collected it.
    settlement: {
      payable:        { type: Number },
      commissionRate: { type: Number },
      commission:     { type: Number },
      driverEarning:  { type: Number },
      method:         { type: String, enum: ["cash"], default: "cash" },
      status:         { type: String, enum: ["due", "collected", "disputed"] },
      collectedAt:    { type: Date },
      disputeNote:    { type: String },
    },
  },
  { timestamps: true }
);

RideSchema.index({ "pickupLocation.coordinates": "2dsphere" });
RideSchema.index({ "dropoffLocation.coordinates": "2dsphere" });

module.exports = mongoose.model("Ride", RideSchema);
