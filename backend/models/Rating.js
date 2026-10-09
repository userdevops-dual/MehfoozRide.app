// ─────────────────────────────────────────
//  models/Rating.js
//  Schema for ride ratings and complaints
// ─────────────────────────────────────────

const mongoose = require("mongoose");

const RatingSchema = new mongoose.Schema(
  {
    // ── Which ride this rating belongs to ────
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ride",
      required: true,
    },

    // ── Who gave the rating ──────────────────
    ratedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Who received the rating ──────────────
    ratedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ── Star Rating ──────────────────────────
    // 5-category ratings (REQ 17)
  categoryRatings: {
    safety:          { type: Number, min: 1, max: 5, default: 0 },
    professionalism: { type: Number, min: 1, max: 5, default: 0 },
    cleanliness:     { type: Number, min: 1, max: 5, default: 0 },
    punctuality:     { type: Number, min: 1, max: 5, default: 0 },
    respectful:      { type: Number, min: 1, max: 5, default: 0 },
  },
  stars: {
      type: Number,
      required: [true, "Star rating is required"],
      min: [1, "Minimum rating is 1"],
      max: [5, "Maximum rating is 5"],
    },

    // ── Written Comment ──────────────────────
    comment: {
      type: String,
      trim: true,
      maxlength: [500, "Comment cannot exceed 500 characters"],
      default: "",
    },

    // ── Complaint / Report ───────────────────
    hasComplaint: {
      type: Boolean,
      default: false,
    },

    complaintType: {
      type: String,
      enum: [
        "unsafe_driving",
        "wrong_route",
        "rude_behaviour",
        "harassment",
        "vehicle_condition",
        "other",
        "",
      ],
      default: "",
    },

    complaintDetails: {
      type: String,
      default: "",
      maxlength: [1000, "Complaint cannot exceed 1000 characters"],
    },

    // ── Admin Review Status ──────────────────
    complaintStatus: {
      type: String,
      enum: ["pending", "reviewed", "resolved", "dismissed"],
      default: "pending",
    },

    adminNotes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Rating", RatingSchema);
