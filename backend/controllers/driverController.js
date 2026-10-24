const FARE = require('../config/fare');
const mongoose = require('mongoose');
const { driverVerification } = require('../services/verification');
// mehfooz-backend/controllers/driverController.js
// Handles: Driver document upload, verification status, online toggle

const User = require('../models/User');

// ════════════════════════════════════════
//  @route  PUT /api/driver/upload-docs
//  @desc   Driver uploads verification documents
//  @access Private (driver only)
// ════════════════════════════════════════
exports.uploadDocuments = async (req, res) => {
  try {
    const {
      cnicNumber,
      licenseNumber,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      licensePlate,
      // In production these would be file upload URLs (via Cloudinary / AWS S3)
      cnicPhotoUrl,
      licensePhotoUrl,
      registrationPhotoUrl,
    } = req.body;

    if (!cnicNumber || !licenseNumber || !vehicleMake || !vehicleModel || !licensePlate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide CNIC, license number, vehicle make/model and license plate',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        driverDetails: {
          cnicNumber,
          licenseNumber,
          vehicleMake,
          vehicleModel,
          vehicleYear:       vehicleYear        || '',
          vehicleColor:      vehicleColor       || '',
          licensePlate,
          cnicPhoto:         cnicPhotoUrl       || '',
          licensePhoto:      licensePhotoUrl    || '',
          registrationPhoto: registrationPhotoUrl || '',
        },
        isVerified: false,  // Reset to pending — admin must re-approve
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Documents submitted! Your account is under review (24–48 hrs).',
      user: {
        _id:           updatedUser._id,
        name:          updatedUser.name,
        driverDetails: updatedUser.driverDetails,
        isVerified:    updatedUser.isVerified,
      },
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
      User.findById(req.user.id).select('averageRating totalRatings ratingSummary isOnline isVerified cnicVerified driverDetails'),
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
