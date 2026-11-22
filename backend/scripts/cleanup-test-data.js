// scripts/cleanup-test-data.js — removes data created by the automated tests
// (tests/*.test.js) so the demo accounts show only real usage again.
//
//   node scripts/cleanup-test-data.js           preview: shows what would be deleted
//   node scripts/cleanup-test-data.js --apply   deletes it
//
// Test rides are recognised by the fixed addresses the tests use. Their ratings,
// pools and SOS sessions go with them; ride counts and driver ratings are then
// recalculated from what is left.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");

const TEST_PICKUPS = ["Test pickup", "DHA test", "DHA Phase 5"];
const apply = process.argv.includes("--apply");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;
  const Rides = db.collection("rides"), Ratings = db.collection("ratings"), Pools = db.collection("ridepools");
  const Sessions = db.collection("emergencysessions"), Users = db.collection("users");

  const rides = await Rides.find({ "pickupLocation.address": { $in: TEST_PICKUPS } }, { projection: { _id: 1, pool: 1 } }).toArray();
  const ids = rides.map(r => r._id);
  const poolIds = [...new Set(rides.map(r => r.pool).filter(Boolean).map(String))].map(id => new mongoose.Types.ObjectId(id));
  const sessionQuery = { $or: [{ ride: { $in: ids } }, { resolvedNote: { $in: ["test", "Phase 5 test setup"] } }] };

  const counts = {
    rides: ids.length,
    ratings: await Ratings.countDocuments({ ride: { $in: ids } }),
    pools: poolIds.length,
    sosSessions: await Sessions.countDocuments(sessionQuery),
  };
  console.log(apply ? "Deleting:" : "Would delete (preview — run with --apply to delete):", counts);
  if (!apply) { await mongoose.disconnect(); return; }

  await Ratings.deleteMany({ ride: { $in: ids } });
  await Sessions.deleteMany(sessionQuery);
  await Pools.deleteMany({ _id: { $in: poolIds } });
  await Rides.deleteMany({ _id: { $in: ids } });

  // Ride counts and driver ratings from what remains
  const { recalcDriverRating } = require("../services/ratings");
  const users = await Users.find({}, { projection: { _id: 1, role: 1 } }).toArray();
  for (const u of users) {
    const field = u.role === "driver" ? "driver" : "passenger";
    const totalRides = await Rides.countDocuments({ [field]: u._id, status: "completed" });
    await Users.updateOne({ _id: u._id }, { $set: { totalRides } });
    if (u.role === "driver") await recalcDriverRating(u._id);
  }
  console.log(`Done. Ride counts and ratings recalculated for ${users.length} users.`);
  await mongoose.disconnect();
})().catch(async (e) => { console.error(e); await mongoose.disconnect().catch(() => {}); process.exit(1); });
