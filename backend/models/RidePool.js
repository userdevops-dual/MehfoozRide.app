// models/RidePool.js — a group of consenting passengers sharing one vehicle.
// Each passenger keeps her own Ride (own pickup, drop-off, OTP and fare share).
//   open   → still accepting compatible passengers (no driver yet)
//   locked → a driver accepted; no more passengers can join
//   closed → every ride in the pool has ended
const mongoose = require("mongoose");

const RidePoolSchema = new mongoose.Schema(
  {
    rides:         [{ type: mongoose.Schema.Types.ObjectId, ref: "Ride" }],
    status:        { type: String, enum: ["open", "locked", "closed"], default: "open" },
    driver:        { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    maxPassengers: { type: Number, default: 3 },
    vehicleTotal:  { type: Number, default: 0 },   // estimated total paid by the group
  },
  { timestamps: true }
);

module.exports = mongoose.model("RidePool", RidePoolSchema);
