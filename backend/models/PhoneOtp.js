// models/PhoneOtp.js — one pending phone verification per number
// Codes and tokens are stored only as SHA-256 hashes.
const mongoose = require("mongoose");

const PhoneOtpSchema = new mongoose.Schema(
  {
    phone:      { type: String, required: true, unique: true },   // +923XXXXXXXXX
    codeHash:   { type: String, required: true },
    expiresAt:  { type: Date,   required: true },
    attempts:   { type: Number, default: 0 },
    lastSentAt: { type: Date,   required: true },

    // Set after a correct code — signup must present this token
    verified:              { type: Boolean, default: false },
    verificationTokenHash: { type: String,  default: null },
    tokenExpiresAt:        { type: Date,    default: null },
  },
  { timestamps: true }
);

// Old records are removed automatically after a day
PhoneOtpSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model("PhoneOtp", PhoneOtpSchema);
