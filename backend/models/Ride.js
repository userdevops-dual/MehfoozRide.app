// ─────────────────────────────────────────
//  models/Ride.js — with OTP failure tracking, farePerPassenger
// ─────────────────────────────────────────

const mongoose = require("mongoose");

const RideSchema = new mongoose.Schema(
  {
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    driver:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    isPooled: { type: Boolean, default: false },
    poolPassengers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    maxPoolSize: { type: Number, default: 1 },

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

    rideType: {
      type: String,
      enum: ['economy', 'ac', 'bike'],
      default: 'economy',
    },
    moodPreference: {
      type: String,
      enum: ["quiet", "friendly", "talkative"],
      default: "quiet",
    },

    otp:         { type: String, required: true },
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

    requestedAt:  { type: Date, default: Date.now },
    acceptedAt:   { type: Date },
    arrivedAt:    { type: Date },
    startedAt:    { type: Date },
    completedAt:  { type: Date },
    cancelledAt:  { type: Date },

    routeCoordinates: [{ coordinates: [Number], timestamp: Date }],

    sosActivated:  { type: Boolean, default: false },
    routeDeviated: { type: Boolean, default: false },

    // ── Guardian notifications log ────────────────────────────────────────
    guardianNotifications: [
      {
        event:     { type: String },  // "ride_booked", "driver_assigned", "ride_started", "ride_completed", "sos"
        sentAt:    { type: Date, default: Date.now },
        contacts:  [{ name: String, phone: String }],
      },
    ],

    rating: { type: mongoose.Schema.Types.ObjectId, ref: "Rating", default: null },
  },
  { timestamps: true }
);

RideSchema.index({ "pickupLocation.coordinates": "2dsphere" });
RideSchema.index({ "dropoffLocation.coordinates": "2dsphere" });

module.exports = mongoose.model("Ride", RideSchema);
