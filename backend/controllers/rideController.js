// ─────────────────────────────────────────
//  controllers/rideController.js
//  Handles: Book, Accept, OTP (with fake-ride detection), Complete, Rate
// ─────────────────────────────────────────

const Ride   = require("../models/Ride");
const User   = require("../models/User");
const Rating = require("../models/Rating");

// ── Helper: Generate 4-digit OTP ─────────
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

// ── Dynamic Fare Calculator ───────────────
// Fare = Base Fare + (Distance × Rate/km) + (Time × Rate/min)
const calculateFare = (distanceKm, durationMinutes = 0, isPooled = false) => {
  const BASE_FARE    = 80;
  const RATE_PER_KM  = 25;
  const RATE_PER_MIN = 5;
  const POOL_DISCOUNT = 100;

  const distanceFare  = distanceKm * RATE_PER_KM;
  const timeFare      = durationMinutes * RATE_PER_MIN;
  let fare            = BASE_FARE + distanceFare + timeFare;
  const discount      = isPooled ? POOL_DISCOUNT : 0;
  fare               -= discount;

  const total = Math.max(fare, 50);
  const farePerPassenger = isPooled ? Math.ceil(total / 2) : total; // split 50/50 for pooled

  return {
    baseFare:        BASE_FARE,
    distanceFare:    Math.round(distanceFare),
    timeFare:        Math.round(timeFare),
    discount,
    total:           Math.round(total),
    farePerPassenger: Math.round(farePerPassenger),
  };
};

// ════════════════════════════════════════
//  @route  POST /api/rides/book
// ════════════════════════════════════════
exports.bookRide = async (req, res) => {
  try {
    const {
      pickupAddress, pickupCoordinates,
      dropoffAddress, dropoffCoordinates,
      distanceKm, moodPreference, isPooled,
    } = req.body;

    if (!pickupAddress || !dropoffAddress || !pickupCoordinates || !dropoffCoordinates) {
      return res.status(400).json({ success: false, message: "Pickup and dropoff locations are required" });
    }

    const activeRide = await Ride.findOne({
      passenger: req.user.id,
      status: { $in: ["requested", "accepted", "arrived", "in_progress"] },
    });
    if (activeRide) {
      return res.status(400).json({ success: false, message: "You already have an active ride", rideId: activeRide._id });
    }

    const fareDetails = calculateFare(distanceKm || 7, 0, isPooled);
    const otp = generateOTP();

    const ride = await Ride.create({
      passenger:       req.user.id,
      pickupLocation:  { address: pickupAddress,  coordinates: pickupCoordinates },
      dropoffLocation: { address: dropoffAddress, coordinates: dropoffCoordinates },
      distanceKm:      distanceKm || 7,
      estimatedFare:   fareDetails.total,
      fareBreakdown:   fareDetails,
      farePerPassenger: fareDetails.farePerPassenger,
      moodPreference:  moodPreference || "quiet",
      isPooled:        isPooled || false,
      maxPoolSize:     isPooled ? 3 : 1,
      otp,
      status: "requested",
    });

    // Notify guardian contacts that a ride has been booked (auto-sharing)
    const passenger = await User.findById(req.user.id).select("guardianContacts name");
    const activeGuardians = (passenger.guardianContacts || []).filter(c => c.isActive);

    res.status(201).json({
      success: true,
      message: "Ride booked successfully! Finding your driver...",
      ride: {
        _id:             ride._id,
        otp:             ride.otp,
        estimatedFare:   ride.estimatedFare,
        fareBreakdown:   ride.fareBreakdown,
        farePerPassenger: ride.farePerPassenger,
        pickupLocation:  ride.pickupLocation,
        dropoffLocation: ride.dropoffLocation,
        status:          ride.status,
        moodPreference:  ride.moodPreference,
        isPooled:        ride.isPooled,
      },
      guardianNotified: activeGuardians.length > 0,
      guardiansCount:   activeGuardians.length,
    });

  } catch (error) {
    console.error("Book ride error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  PUT /api/rides/:id/accept
//  Driver accepts — includes same-gender check log
// ════════════════════════════════════════
exports.acceptRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });

    if (ride.status !== "requested") {
      return res.status(400).json({ success: false, message: "This ride has already been accepted" });
    }

    // ── Only verified female driver can accept ──
    const driver = await User.findById(req.user.id);
    if (!driver.isVerified) {
      return res.status(403).json({ success: false, message: "Your account is pending admin approval" });
    }
    if (driver.gender !== "female") {
      return res.status(403).json({ success: false, message: "Only female drivers can accept rides on Mehfooz Ride" });
    }

    ride.driver     = req.user.id;
    ride.status     = "accepted";
    ride.acceptedAt = Date.now();
    await ride.save();

    const populatedRide = await Ride.findById(ride._id)
      .populate("passenger", "name phone guardianContacts")
      .populate("driver",    "name phone driverDetails averageRating");

    // ── Auto-notify guardian contacts that driver has been assigned ──
    const activeGuardians = (populatedRide.passenger.guardianContacts || []).filter(c => c.isActive);
    if (activeGuardians.length > 0) {
      console.log(`📱 Guardian Auto-Notify: Driver assigned for ${populatedRide.passenger.name}`);
      activeGuardians.forEach(g => {
        console.log(`  → Notifying ${g.name} (${g.phone}): Driver ${driver.name} | ${driver.driverDetails?.licensePlate} is on the way`);
      });
    }

    res.status(200).json({
      success: true,
      message: "Ride accepted! Navigate to pickup location.",
      ride: populatedRide,
      guardianAutoNotified: activeGuardians.length > 0,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  PUT /api/rides/:id/arrived
// ════════════════════════════════════════
exports.driverArrived = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride || ride.driver.toString() !== req.user.id) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }

    ride.status    = "arrived";
    ride.arrivedAt = Date.now();
    await ride.save();

    res.status(200).json({ success: true, message: "Arrival marked. Ask passenger for OTP." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/rides/:id/verify-otp
//  With FAKE RIDE DETECTION (tracks OTP failures)
// ════════════════════════════════════════
exports.verifyOTP = async (req, res) => {
  try {
    const { otp } = req.body;
    const ride = await Ride.findById(req.params.id);

    if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });
    if (ride.driver.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // ── Fake Ride Detection: Track OTP failures ──────────────────────────
    if (ride.otp !== otp) {
      ride.otpFailureCount = (ride.otpFailureCount || 0) + 1;
      await ride.save();

      // Also flag the driver if repeated failures
      await User.findByIdAndUpdate(req.user.id, { $inc: { otpFailures: 1 } });
      const driver = await User.findById(req.user.id);

      let warningMessage = "Incorrect OTP. Please ask passenger for the correct code.";

      if (ride.otpFailureCount >= 3) {
        // 3+ failures = auto-cancel, flag as possible fake ride
        ride.status      = "cancelled";
        ride.cancelReason = `Ride cancelled: OTP verification failed ${ride.otpFailureCount} times — possible fake/unsafe ride`;
        ride.cancelledAt  = Date.now();
        await ride.save();

        // Flag driver for review
        if (!driver.otpFailureFlagged) {
          await User.findByIdAndUpdate(req.user.id, { otpFailureFlagged: true });
        }

        return res.status(400).json({
          success: false,
          message: `⚠️ Ride CANCELLED after ${ride.otpFailureCount} wrong OTP attempts. This incident has been reported to safety team.`,
          rideCancelled: true,
          incidentReported: true,
        });
      }

      if (ride.otpFailureCount === 2) {
        warningMessage = `⚠️ 2nd wrong OTP. ONE more failure will cancel this ride and alert the safety team.`;
      } else if (ride.otpFailureCount === 1) {
        warningMessage = `Wrong OTP (attempt ${ride.otpFailureCount}/3). Please verify the code with the passenger.`;
      }

      return res.status(400).json({
        success: false,
        message: warningMessage,
        failureCount: ride.otpFailureCount,
        remainingAttempts: 3 - ride.otpFailureCount,
      });
    }

    // ── OTP Correct — Start Ride ──────────────────────────────────────────
    ride.otpVerified     = true;
    ride.status          = "in_progress";
    ride.startedAt       = Date.now();
    ride.otpFailureCount = 0; // reset on success
    await ride.save();

    // ── Auto-notify guardians ride has officially started ──────────────────
    const fullRide = await Ride.findById(ride._id)
      .populate("passenger", "name phone guardianContacts")
      .populate("driver", "name phone driverDetails");

    const activeGuardians = (fullRide.passenger.guardianContacts || []).filter(c => c.isActive);
    if (activeGuardians.length > 0) {
      console.log(`🛡️ Guardian Ride-Start Notification: ${fullRide.passenger.name}'s ride has started`);
      activeGuardians.forEach(g => {
        console.log(`  → SMS to ${g.name} (${g.phone}): Ride started | Driver: ${fullRide.driver?.name} | Plate: ${fullRide.driver?.driverDetails?.licensePlate}`);
      });
    }

    res.status(200).json({
      success: true,
      message: "OTP verified! Ride has started. Drive safely 🌸",
      ride: { _id: ride._id, status: ride.status, startedAt: ride.startedAt },
      guardianNotified: activeGuardians.length > 0,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  PUT /api/rides/:id/complete
//  With final dynamic fare + guardian notification
// ════════════════════════════════════════
exports.completeRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride || ride.driver.toString() !== req.user.id) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    if (ride.status !== "in_progress") {
      return res.status(400).json({ success: false, message: "Ride is not in progress" });
    }

    // ── Final fare using actual duration ──
    const durationMinutes = ride.startedAt
      ? Math.round((Date.now() - ride.startedAt.getTime()) / 60000)
      : 0;

    const fareDetails  = calculateFare(ride.distanceKm, durationMinutes, ride.isPooled);
    ride.actualFare    = fareDetails.total;
    ride.fareBreakdown = fareDetails;
    ride.farePerPassenger = fareDetails.farePerPassenger;
    ride.status        = "completed";
    ride.completedAt   = Date.now();
    ride.durationMinutes = durationMinutes;
    await ride.save();

    await User.findByIdAndUpdate(req.user.id, { $inc: { totalRides: 1 } });
    await User.findByIdAndUpdate(ride.passenger, { $inc: { totalRides: 1 } });

    // ── Notify guardians ride is complete ──
    const fullRide = await Ride.findById(ride._id).populate("passenger", "name phone guardianContacts");
    const activeGuardians = (fullRide.passenger.guardianContacts || []).filter(c => c.isActive);
    if (activeGuardians.length > 0) {
      console.log(`✅ Guardian Ride-Complete Notification: ${fullRide.passenger.name} arrived safely`);
      activeGuardians.forEach(g => {
        console.log(`  → SMS to ${g.name} (${g.phone}): ${fullRide.passenger.name} has arrived safely!`);
      });
    }

    res.status(200).json({
      success: true,
      message: "Ride completed successfully! 🌸",
      ride: {
        _id:              ride._id,
        actualFare:       ride.actualFare,
        farePerPassenger: ride.farePerPassenger,
        fareBreakdown:    ride.fareBreakdown,
        durationMinutes,
        distanceKm:       ride.distanceKm,
        status:           ride.status,
      },
      guardianNotified: activeGuardians.length > 0,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  PUT /api/rides/:id/cancel
// ════════════════════════════════════════
exports.cancelRide = async (req, res) => {
  try {
    const { reason } = req.body;
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });
    if (ride.status === "completed" || ride.status === "cancelled") {
      return res.status(400).json({ success: false, message: "Cannot cancel this ride" });
    }
    ride.status       = "cancelled";
    ride.cancelReason = reason || "No reason given";
    ride.cancelledAt  = Date.now();
    await ride.save();
    res.status(200).json({ success: true, message: "Ride cancelled" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/rides/:id/rate
// ════════════════════════════════════════
exports.submitRating = async (req, res) => {
  try {
    const { stars, comment, hasComplaint, complaintType, complaintDetails } = req.body;
    const ride = await Ride.findById(req.params.id).populate("driver");
    if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });
    if (ride.status !== "completed") return res.status(400).json({ success: false, message: "Ride must be completed before rating" });
    if (ride.passenger.toString() !== req.user.id) return res.status(403).json({ success: false, message: "Only the passenger can rate this ride" });
    if (ride.rating) return res.status(400).json({ success: false, message: "You have already rated this ride" });

    const rating = await Rating.create({
      ride: ride._id, ratedBy: req.user.id, ratedUser: ride.driver._id,
      stars, comment: comment || "", hasComplaint: hasComplaint || false,
      complaintType: complaintType || "", complaintDetails: complaintDetails || "",
    });
    ride.rating = rating._id;
    await ride.save();

    const driver = await User.findById(ride.driver._id);
    await driver.updateRating(stars);

    if (driver.averageRating < 2 && driver.totalRatings >= 5) {
      driver.isSuspended   = true;
      driver.suspendReason = "Average rating dropped below 2.0 — under review";
      await driver.save();
    }

    res.status(201).json({
      success: true,
      message: "Rating submitted. Thank you! 🌸",
      rating: { stars, driverNewRating: driver.averageRating.toFixed(1) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  GET /api/rides/my-rides
// ════════════════════════════════════════
exports.getMyRides = async (req, res) => {
  try {
    const query = req.user.role === "driver" ? { driver: req.user.id } : { passenger: req.user.id };
    const rides = await Ride.find(query)
      .populate("driver",    "name averageRating driverDetails")
      .populate("passenger", "name phone")
      .populate("rating")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: rides.length, rides });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  GET /api/rides/:id
// ════════════════════════════════════════
exports.getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate("driver",    "name phone averageRating driverDetails")
      .populate("passenger", "name phone guardianContacts")
      .populate("rating");
    if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });
    res.status(200).json({ success: true, ride });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/rides/:id/sos
// ════════════════════════════════════════
exports.activateSOS = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate("passenger", "name phone guardianContacts")
      .populate("driver",    "name phone driverDetails");
    if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });

    ride.sosActivated = true;
    await ride.save();

    res.status(200).json({
      success: true,
      message: "SOS activated! Emergency contacts have been notified.",
      guardianContacts: ride.passenger.guardianContacts,
      driverInfo: {
        name:         ride.driver.name,
        phone:        ride.driver.phone,
        licensePlate: ride.driver.driverDetails?.licensePlate,
        vehicle:      `${ride.driver.driverDetails?.vehicleMake} ${ride.driver.driverDetails?.vehicleModel}`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  GET /api/rides/:id/live-fare
//  Real-time fare update during ride
// ════════════════════════════════════════
exports.getLiveFare = async (req, res) => {
  try {
    const { distanceKm } = req.query;
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ success: false, message: "Ride not found" });

    const durationMinutes = ride.startedAt
      ? Math.round((Date.now() - ride.startedAt.getTime()) / 60000)
      : 0;

    const fareDetails = calculateFare(
      parseFloat(distanceKm) || ride.distanceKm,
      durationMinutes,
      ride.isPooled
    );

    res.status(200).json({
      success: true,
      liveFare: fareDetails.total,
      farePerPassenger: fareDetails.farePerPassenger,
      fareBreakdown: fareDetails,
      durationMinutes,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
