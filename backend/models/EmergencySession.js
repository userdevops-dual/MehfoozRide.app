// models/EmergencySession.js — one SOS: who raised it, the incident snapshot
// prepared for police/emergency services, the live location trail, and what
// was actually done (contacts notified, police dispatch status).
const mongoose = require("mongoose");

const PointSchema = new mongoose.Schema({
  coordinates: { type: [Number] },          // [lng, lat]
  accuracy:    { type: Number },            // metres, as reported by the device
  at:          { type: Date, default: Date.now },
}, { _id: false });

const EmergencySessionSchema = new mongoose.Schema({
  raisedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  raisedByRole: { type: String, enum: ["passenger", "driver"], required: true },
  ride:         { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },
  status:       { type: String, enum: ["active", "resolved"], default: "active" },
  startedAt:    { type: Date, default: Date.now },
  resolvedAt:   { type: Date },
  resolvedNote: { type: String, default: "" },
  demo:         { type: Boolean, default: true },   // simulated parts (SMS, police) were simulated

  // Live trail
  locations:    { type: [PointSchema], default: [] },
  lastLocation: { type: PointSchema, default: null },

  // Incident payload — the same structure a real police/emergency API would receive
  incident: {
    reporter: {
      id: String, role: String, name: String, phone: String,
      emergencyContacts: [{ name: String, phone: String, relation: String }],
    },
    passenger: { id: String, name: String, phone: String },
    driver: {
      id: String, name: String, phone: String, verified: Boolean, verificationSource: String,
      vehicle: String, vehicleColor: String, licensePlate: String,
    },
    trip: {
      rideId: String, status: String,
      pickup:  { address: String, coordinates: [Number] },
      dropoff: { address: String, coordinates: [Number] },
      route:   { source: String, distanceKm: Number, durationMin: Number },
      startedAt: Date,
      routeDeviated: Boolean,
      routeDeviationActive: Boolean,
      // 'type' must be wrapped, or Mongoose reads it as the array's type
      safePoints: [{ name: String, type: { type: String }, coordinates: [Number] }],
    },
    initialLocation: { type: PointSchema, default: null },
    raisedAt: Date,
  },

  // What happened
  contactNotifications: [{
    name: String, phone: String, relation: String, channel: String,
    status: { type: String, enum: ["simulated", "sent", "failed", "not_configured"] },
    detail: String, at: Date,
  }],
  police: {
    status: { type: String, enum: ["not_integrated", "simulated", "sent", "failed"], default: "not_integrated" },
    detail: String,
    at: Date,
  },

  // Live-location link for contacts (no login) — random, expires
  shareToken:     { type: String, index: true },
  shareExpiresAt: { type: Date },
}, { timestamps: true });

EmergencySessionSchema.index({ raisedBy: 1, status: 1 });

module.exports = mongoose.model("EmergencySession", EmergencySessionSchema);
