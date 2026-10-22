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

    const completedRides = await Ride.find({
      driver: req.user.id,
      status: 'completed',
    }).select('actualFare distanceKm durationMinutes completedAt');

    const totalEarnings  = completedRides.reduce((sum, r) => sum + (r.actualFare || 0), 0);
    const totalDistance  = completedRides.reduce((sum, r) => sum + (r.distanceKm  || 0), 0);
    const totalRides     = completedRides.length;

    // Today's earnings
    const today     = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRides = completedRides.filter(r => new Date(r.completedAt) >= today);
    const todayEarnings = todayRides.reduce((sum, r) => sum + (r.actualFare || 0), 0);

    const driver = await User.findById(req.user.id).select('averageRating totalRatings isOnline isVerified cnicVerified driverDetails');

    res.status(200).json({
      success: true,
      stats: {
        totalEarnings,
        todayEarnings,
        totalRides,
        totalDistance:    Math.round(totalDistance * 10) / 10,
        averageRating:    driver.averageRating,
        totalRatings:     driver.totalRatings,
        isOnline:         driver.isOnline,
        verification:     driverVerification(driver),
      },
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
