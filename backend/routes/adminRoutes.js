// routes/adminRoutes.js — Admin dashboard: approvals, background checks, SOS, fake rides
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const User = require('../models/User');
const Ride = require('../models/Ride');
const storage = require('../services/storage');

router.use(protect);
router.use(authorize('admin'));

// GET /api/admin/drivers/pending
router.get('/drivers/pending', async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver', isVerified: false })
      .select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: drivers.length, drivers });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admin/drivers/background-review
// Drivers with background check pending or failed
router.get('/drivers/background-review', async (req, res) => {
  try {
    const drivers = await User.find({
      role: 'driver',
      'driverDetails.backgroundCheck': { $in: ['pending', 'failed'] }
    }).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: drivers.length, drivers });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/admin/drivers/:id/approve
// Full approval: CNIC verified + background check passed
router.put('/drivers/:id/approve', async (req, res) => {
  try {
    const { backgroundNotes, criminalDeclaration } = req.body;
    const driver = await User.findById(req.params.id);
    if (!driver || driver.role !== 'driver') return res.status(404).json({ success: false, message: 'Driver not found' });

    // ── Background check requirements ─────────────────────────────────────
    if (!driver.cnicVerified) {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve: CNIC not verified',
      });
    }
    if (!driver.driverDetails?.licenseNumber) {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve: No driving license on file',
      });
    }
    if (!driver.driverDetails?.licensePlate) {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve: No vehicle registration on file',
      });
    }

    driver.isVerified = true;
    driver.driverDetails.backgroundCheck  = 'passed';
    driver.driverDetails.backgroundNotes  = backgroundNotes || 'Verified by admin';
    driver.driverDetails.criminalDeclaration = criminalDeclaration !== false;

    await driver.save();
    res.json({
      success: true,
      message: '✅ Driver approved — CNIC, license, and background check passed',
      driver: { _id: driver._id, name: driver.name, isVerified: true, backgroundCheck: 'passed' },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/admin/drivers/:id/reject-background
router.put('/drivers/:id/reject-background', async (req, res) => {
  try {
    const { reason } = req.body;
    const driver = await User.findByIdAndUpdate(
      req.params.id,
      {
        'driverDetails.backgroundCheck': 'failed',
        'driverDetails.backgroundNotes': reason || 'Background check failed',
        isSuspended: true,
        suspendReason: `Background check failed: ${reason || 'Admin review'}`,
      },
      { new: true }
    );
    res.json({ success: true, message: 'Driver background check failed and account suspended', driver });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/admin/users/:id/suspend
router.put('/users/:id/suspend', async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isSuspended: true, suspendReason: reason || 'Suspended by admin' },
      { new: true }
    );
    res.json({ success: true, message: 'Account suspended', user });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/admin/users/:id/unsuspend
router.put('/users/:id/unsuspend', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isSuspended: false, suspendReason: '' },
      { new: true }
    );
    res.json({ success: true, message: 'Account reinstated', user });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admin/sos-incidents
router.get('/sos-incidents', async (req, res) => {
  try {
    const incidents = await Ride.find({ sosActivated: true })
      .populate('passenger', 'name phone')
      .populate('driver', 'name phone driverDetails')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: incidents.length, incidents });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admin/route-deviations
router.get('/route-deviations', async (req, res) => {
  try {
    const deviations = await Ride.find({ routeDeviated: true })
      .populate('passenger', 'name phone')
      .populate('driver', 'name phone driverDetails')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: deviations.length, deviations });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admin/fake-ride-incidents
// Rides with OTP failure counts (possible fake rides)
router.get('/fake-ride-incidents', async (req, res) => {
  try {
    const incidents = await Ride.find({ $or: [{ fakeRideSuspected: true }, { otpFailureCount: { $gte: 1 } }] })
      .populate('passenger', 'name phone')
      .populate('driver', 'name phone driverDetails otpFailures otpFailureFlagged')
      .sort({ otpFailureCount: -1, createdAt: -1 });
    res.json({ success: true, count: incidents.length, incidents });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admin/flagged-drivers
// Drivers flagged for OTP abuse (possible fake rides)
router.get('/flagged-drivers', async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver', otpFailureFlagged: true })
      .select('-password').sort({ otpFailures: -1 });
    res.json({ success: true, count: drivers.length, drivers });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admin/active-rides
router.get('/active-rides', async (req, res) => {
  try {
    const rides = await Ride.find({ status: { $in: ['accepted', 'arrived', 'otp_verified', 'in_progress'] } })
      .populate('passenger','name phone')
      .populate('driver','name phone driverDetails')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: rides.length, rides });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers, totalDrivers, totalPassengers,
      pendingDrivers, activeRides, completedRides,
      sosCount, deviationCount, fakeRideCount, flaggedDrivers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'driver' }),
      User.countDocuments({ role: 'passenger' }),
      User.countDocuments({ role: 'driver', isVerified: false }),
      Ride.countDocuments({ status: { $in: ['accepted', 'arrived', 'in_progress'] } }),
      Ride.countDocuments({ status: 'completed' }),
      Ride.countDocuments({ sosActivated: true }),
      Ride.countDocuments({ routeDeviated: true }),
      Ride.countDocuments({ otpFailureCount: { $gte: 3 } }),
      User.countDocuments({ role: 'driver', otpFailureFlagged: true }),
    ]);
    const revenue = await Ride.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$actualFare' } } }
    ]);
    res.json({
      success: true,
      stats: {
        totalUsers, totalDrivers, totalPassengers, pendingDrivers,
        activeRides, completedRides, sosCount, deviationCount,
        fakeRideCount, flaggedDrivers,
        totalRevenue: revenue[0]?.total || 0,
      },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/admin/users/:id/cnic/:side — view a CNIC photo (front | back), admins only.
// Photos are stored privately and are never returned by any other endpoint.
router.get('/users/:id/cnic/:side', async (req, res) => {
  try {
    const side = req.params.side;
    if (!['front', 'back'].includes(side)) return res.status(400).json({ success: false, message: 'side must be front or back' });
    const user = await User.findById(req.params.id).select(`+cnicImages.${side}`);
    const key = user?.cnicImages?.[side];
    if (!key) return res.status(404).json({ success: false, message: 'No CNIC photo on file' });
    const file = await storage.read(key);
    res.set('Cache-Control', 'no-store');
    res.sendFile(file);
  } catch (e) { res.status(404).json({ success: false, message: 'CNIC photo not found' }); }
});

// GET /api/admin/drivers/approved — all currently verified active drivers
router.get('/drivers/approved', async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver', isVerified: true })
      .select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: drivers.length, drivers });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
