const FARE = require('../config/fare');
const mongoose = require('mongoose');
const { driverVerification } = require('../services/verification');
// mehfooz-backend/controllers/driverController.js
// Handles: Driver document upload, verification status, online toggle

const User = require('../models/User');

// Photos are kept in private storage; the user record holds only the storage keys.
const storage = require('../services/storage');
const extOf = (f) => ({ 'image/png': '.png', 'image/webp': '.webp' }[f.mimetype] || '.jpg');
const DOC_FIELDS = { licensePhoto: 'license', registrationPhoto: 'registration', profilePhoto: 'profile' };
const docStatus = (u) => ({
  cnicPhotos:        !!(u.cnicImages?.uploadedAt || u.driverDetails?.cnicPhoto),
  licensePhoto:      !!u.driverDetails?.licensePhoto,
  registrationPhoto: !!u.driverDetails?.registrationPhoto,
  profilePhoto:      !!u.profilePhoto,
  licenseNumber:     u.driverDetails?.licenseNumber || '',
  vehicleMake:       u.driverDetails?.vehicleMake || '',
  vehicleModel:      u.driverDetails?.vehicleModel || '',
  vehicleYear:       u.driverDetails?.vehicleYear || '',
  vehicleColor:      u.driverDetails?.vehicleColor || '',
  licensePlate:      u.driverDetails?.licensePlate || '',
  isVerified:        !!u.isVerified,
  backgroundCheck:   u.driverDetails?.backgroundCheck || 'pending',
});

// ════════════════════════════════════════
//  @route  GET /api/driver/documents      what the driver has on file (no keys)
// ════════════════════════════════════════
exports.getDocuments = async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select('isVerified cnicVerified profilePhoto driverDetails cnicImages.uploadedAt');
    res.json({ success: true, documents: docStatus(u), verification: driverVerification(u) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  PUT /api/driver/documents   (multipart)
//  Files (each optional): licensePhoto, registrationPhoto, profilePhoto
//  Fields (optional):     licenseNumber, vehicleMake, vehicleModel, vehicleYear, vehicleColor, licensePlate
//  Changing the licence or vehicle (photo or details) sends an approved driver back to admin review.
// ════════════════════════════════════════
exports.uploadDocuments = async (req, res) => {
  try {
    const u = await User.findById(req.user.id);
    const files = req.files || {};
    const set = {};
    const clip = (v, n) => String(v || '').trim().slice(0, n);

    const text = { licenseNumber: 40, vehicleMake: 30, vehicleModel: 30, vehicleYear: 4, vehicleColor: 20, licensePlate: 15 };
    for (const [k, n] of Object.entries(text)) {
      if (req.body?.[k] !== undefined) set[`driverDetails.${k}`] = k === 'licensePlate' ? clip(req.body[k], n).toUpperCase() : clip(req.body[k], n);
    }
    if (set['driverDetails.vehicleYear'] && !/^(19|20)\d{2}$/.test(set['driverDetails.vehicleYear'])) {
      return res.status(400).json({ success: false, message: 'Vehicle year must be like 2020' });
    }
    for (const k of ['licenseNumber', 'licensePlate', 'vehicleMake', 'vehicleModel']) {
      if (set[`driverDetails.${k}`] === '') return res.status(400).json({ success: false, message: 'Licence number, plate, make and model cannot be empty' });
    }

    for (const [field, name] of Object.entries(DOC_FIELDS)) {
      const f = files[field]?.[0];
      if (!f) continue;
      const key = await storage.save(`drivers/${u._id}/${name}-${Date.now()}${extOf(f)}`, f.buffer);
      const old = field === 'profilePhoto' ? u.profilePhoto : u.driverDetails?.[field];
      if (old && old.startsWith('drivers/')) storage.remove(old).catch(() => {});
      if (field === 'profilePhoto') set.profilePhoto = key;
      else set[`driverDetails.${field}`] = key;
    }
    if (!Object.keys(set).length) return res.status(400).json({ success: false, message: 'Nothing to update' });

    // Licence or vehicle changed → admin must look again
    const reReview = Object.keys(set).some(k => k !== 'profilePhoto' && k !== 'driverDetails.vehicleColor');
    if (reReview && u.isVerified) {
      Object.assign(set, { isVerified: false, isOnline: false, 'driverDetails.backgroundCheck': 'pending', 'driverDetails.verificationSource': 'none' });
    }
    const updated = await User.findByIdAndUpdate(u._id, { $set: set }, { new: true })
      .select('isVerified cnicVerified profilePhoto driverDetails cnicImages.uploadedAt');
    res.json({
      success: true,
      message: reReview && u.isVerified ? 'Saved. Your changes go to admin review before you can drive again.' : 'Saved.',
      documents: docStatus(updated),
      verification: driverVerification(updated),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  GET /api/driver/:id/photo   driver's profile photo, for any logged-in user
//  (passengers see who is coming to pick them up)
// ════════════════════════════════════════
exports.getDriverPhoto = async (req, res) => {
  try {
    const u = await User.findOne({ _id: req.params.id, role: 'driver' }).select('profilePhoto');
    if (!u?.profilePhoto) return res.status(404).json({ success: false, message: 'No photo' });
    res.set('Cache-Control', 'private, max-age=3600');
    res.sendFile(await storage.read(u.profilePhoto));
  } catch (error) {
    res.status(404).json({ success: false, message: 'No photo' });
  }
};

// ════════════════════════════════════════
//  @route  PUT /api/driver/toggle-online
//  @desc   Driver toggles online / offline status
//  @access Private (verified driver only)
// ════════════════════════════════════════
exports.toggleOnlineStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;

    if (!req.user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Your account is not verified yet. Please wait for admin approval.',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { isOnline },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: `You are now ${isOnline ? '🟢 Online' : '🔴 Offline'}`,
      isOnline: updatedUser.isOnline,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  GET /api/driver/stats
//  @desc   Get driver's earnings and stats
//  @access Private (driver only)
// ════════════════════════════════════════
exports.getDriverStats = async (req, res) => {
  try {
    const Ride = require('../models/Ride');
    const Rating = require('../models/Rating');
    const id = new mongoose.Types.ObjectId(String(req.user.id));

    const startOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const today = startOf(new Date());
    const week = new Date(today); week.setDate(week.getDate() - 6);          // last 7 days incl. today
    const month = new Date(today.getFullYear(), today.getMonth(), 1);

    // Earnings = driver's share after commission; older rides without a settlement count their full fare
    const earning = { $ifNull: ['$settlement.driverEarning', '$actualFare'] };
    const sumSince = (from) => ({ $sum: { $cond: [{ $gte: ['$completedAt', from] }, earning, 0] } });
    // All queries in parallel — each one is a network round trip to the database
    const [[agg], daily, cancelledByDriver, declined, offered, driver, recentReviews] = await Promise.all([
      Ride.aggregate([
        { $match: { driver: id, status: 'completed' } },
        { $group: {
            _id: null,
            totalRides: { $sum: 1 },
            totalEarnings: { $sum: earning },
            totalFares: { $sum: { $ifNull: ['$settlement.payable', '$actualFare'] } },
            totalCommission: { $sum: { $ifNull: ['$settlement.commission', 0] } },
            todayEarnings: sumSince(today),
            weekEarnings: sumSince(week),
            monthEarnings: sumSince(month),
            todayRides: { $sum: { $cond: [{ $gte: ['$completedAt', today] }, 1, 0] } },
            totalDistance: { $sum: { $ifNull: ['$billedDistanceKm', '$distanceKm'] } },
            totalMinutes: { $sum: { $ifNull: ['$durationMinutes', 0] } },
            pooledRides: { $sum: { $cond: [{ $ifNull: ['$pool', false] }, 1, 0] } },
            cashDue: { $sum: { $cond: [{ $eq: ['$settlement.status', 'due'] }, '$settlement.payable', 0] } },
        } },
      ]),
      // Last 7 days, one bar per day
      Ride.aggregate([
        { $match: { driver: id, status: 'completed', completedAt: { $gte: week } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'Asia/Karachi' } }, earnings: { $sum: earning }, rides: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Ride.countDocuments({ driver: id, status: 'cancelled', cancelledBy: id }),
      Ride.countDocuments({ declinedBy: id }),
      Ride.countDocuments({ offeredTo: id }),
      User.findById(req.user.id).select('averageRating totalRatings ratingSummary isOnline isVerified cnicVerified driverDetails cnicImages.uploadedAt'),
      Rating.find({ ratedUser: id }).sort({ createdAt: -1 }).limit(5).select('stars comment tags createdAt').lean(),
    ]);
    const r = (n) => Math.round((n || 0) * 10) / 10;
    res.status(200).json({
      success: true,
      stats: {
        totalRides:      agg?.totalRides || 0,
        todayRides:      agg?.todayRides || 0,
        pooledRides:     agg?.pooledRides || 0,
        totalEarnings:   agg?.totalEarnings || 0,     // after commission
        todayEarnings:   agg?.todayEarnings || 0,
        weekEarnings:    agg?.weekEarnings || 0,
        monthEarnings:   agg?.monthEarnings || 0,
        totalFares:      agg?.totalFares || 0,        // what passengers paid
        totalCommission: agg?.totalCommission || 0,
        commissionRate:  FARE.commissionRate,
        cashDue:         agg?.cashDue || 0,           // completed rides not yet marked "collected"
        totalDistance:   r(agg?.totalDistance),
        totalHours:      r((agg?.totalMinutes || 0) / 60),
        daily,
        requestsOffered: offered,
        requestsDeclined: declined,
        acceptanceRate:  offered ? Math.round(((offered - declined) / offered) * 100) : null,
        cancelledByDriver,
        averageRating:   driver.totalRatings ? driver.averageRating : null,
        totalRatings:    driver.totalRatings,
        ratingCategories: Object.fromEntries(driver.ratingSummary?.categories || []),
        ratingTags:      Object.fromEntries(driver.ratingSummary?.tags || []),
        recentReviews,
        isOnline:        driver.isOnline,
        verification:    driverVerification(driver),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
