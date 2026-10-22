// ─────────────────────────────────────────
//  models/User.js — with CNIC, background check, guardian auto-notify
// ─────────────────────────────────────────

const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"], trim: true, minlength: [2, "Name must be at least 2 characters"] },
    email: { type: String, required: [true, "Email is required"], unique: true, lowercase: true, trim: true, match: [/\S+@\S+\.\S+/, "Please enter a valid email"] },
    phone: { type: String, required: [true, "Phone number is required"], unique: true, trim: true },
    password: { type: String, required: [true, "Password is required"], minlength: [6, "Password must be at least 6 characters"], select: false },

    // ── CNIC — verified female identity ──────────────────────────────────
    cnic: { type: String, default: "", trim: true },
    cnicVerified: { type: Boolean, default: false },
    cnicVerificationStatus: { type: String, enum: ['not_provided','verified','failed','skipped'], default: 'not_provided' },
    cnicVerificationNote: { type: String, default: '' },
    // Private storage keys for the CNIC photos — never returned in API responses
    cnicImages: {
      front:      { type: String, default: '', select: false },
      back:       { type: String, default: '', select: false },
      uploadedAt: { type: Date },
    },
    phoneVerifiedAt: { type: Date },

    gender: {
      type: String,
      enum: { values: ["female"], message: "Only female users are allowed on Mehfooz Ride" },
      default: "female",
      required: true,
    },

    // "admin" is never assignable through signup — authController only accepts passenger/driver
    role: { type: String, enum: ["passenger", "driver", "admin"], required: [true, "Role is required"], default: "passenger" },
    profilePhoto: { type: String, default: "" },

    // ── Driver-specific ──────────────────────────────────────────────────
    driverDetails: {
      cnicNumber:        { type: String, default: "" },
      licenseNumber:     { type: String, default: "" },
      vehicleMake:       { type: String, default: "" },
      vehicleModel:      { type: String, default: "" },
      vehicleYear:       { type: String, default: "" },
      vehicleColor:      { type: String, default: "" },
      licensePlate:      { type: String, default: "" },
      cnicPhoto:         { type: String, default: "" },
      licensePhoto:      { type: String, default: "" },
      registrationPhoto: { type: String, default: "" },
      // ── Background Check ───────────────────────────────────────────────
      backgroundCheck:   { type: String, enum: ["pending", "passed", "failed"], default: "pending" },
      backgroundNotes:   { type: String, default: "" },
      criminalDeclaration: { type: Boolean, default: false },
    },

    // ── OTP failure tracking (fake ride detection) ───────────────────────
    otpFailures: { type: Number, default: 0 },
    otpFailureFlagged: { type: Boolean, default: false },

    isVerified: { type: Boolean, default: false },
    isOnline:   { type: Boolean, default: false },

    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalRides:    { type: Number, default: 0 },
    totalRatings:  { type: Number, default: 0 },

    // ── Guardian contacts (auto-notified on ride start) ──────────────────
    guardianContacts: [
      {
        name:     { type: String },
        phone:    { type: String },
        isActive: { type: Boolean, default: false },
      },
    ],

    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] },
    },
    locationUpdatedAt: { type: Date },   // drivers with stale GPS are not offered rides

    isSuspended:   { type: Boolean, default: false },
    suspendReason: { type: String,  default: "" },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserSchema.index({ location: "2dsphere" });

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.updateRating = async function (newRating) {
  this.totalRatings += 1;
  this.averageRating = (this.averageRating * (this.totalRatings - 1) + newRating) / this.totalRatings;
  await this.save();
};

module.exports = mongoose.model("User", UserSchema);
