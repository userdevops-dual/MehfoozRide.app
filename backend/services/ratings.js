// services/ratings.js — driver ratings are always computed from the stored
// Rating documents (never incremented or made up), so the profile shows the
// real average, count, per-category averages and behaviour feedback.
const mongoose = require("mongoose");
const Rating = require("../models/Rating");
const User = require("../models/User");

const CATEGORY_KEYS = ["safety", "professionalism", "cleanliness", "punctuality", "respectful"];

// Behaviour / safety feedback the passenger can tick (positive and negative)
const TAGS = {
  positive: ["safe_driving", "followed_route", "polite", "respected_mood", "clean_car", "on_time"],
  negative: ["unsafe_driving", "route_changed", "rude", "ignored_mood", "dirty_car", "late", "phone_while_driving"],
};
const ALL_TAGS = [...TAGS.positive, ...TAGS.negative];

const recalcDriverRating = async (driverId) => {
  const id = new mongoose.Types.ObjectId(String(driverId));
  const [agg] = await Rating.aggregate([
    { $match: { ratedUser: id } },
    {
      $group: {
        _id: null,
        avg: { $avg: "$stars" },
        count: { $sum: 1 },
        ...Object.fromEntries(CATEGORY_KEYS.map(k => [k, { $avg: `$categoryRatings.${k}` }])),
        tags: { $push: "$tags" },
      },
    },
  ]);

  const categories = {};
  const tags = {};
  if (agg) {
    CATEGORY_KEYS.forEach(k => { if (agg[k] != null) categories[k] = Math.round(agg[k] * 10) / 10; });
    agg.tags.flat().forEach(t => { tags[t] = (tags[t] || 0) + 1; });
  }
  const summary = {
    averageRating: agg ? Math.round(agg.avg * 100) / 100 : 0,
    totalRatings: agg ? agg.count : 0,
    ratingSummary: { categories, tags, updatedAt: new Date() },
  };
  await User.updateOne({ _id: id }, summary);
  return summary;
};

module.exports = { CATEGORY_KEYS, TAGS, ALL_TAGS, recalcDriverRating };
