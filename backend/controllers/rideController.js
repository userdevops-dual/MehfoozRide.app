// ─────────────────────────────────────────
//  controllers/rideController.js
//  Handles: Book, Accept, OTP (with fake-ride detection), Complete, Rate
// ─────────────────────────────────────────

const Ride   = require("../models/Ride");
const User   = require("../models/User");
const Rating = require("../models/Rating");
const { haversine } = require("../utils/routeDeviation");

const ACTIVE_STATUSES = ["requested", "accepted", "arrived", "otp_verified", "in_progress"];

// ── Helper: Generate 4-digit OTP ─────────
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

// ── Helpers: ride ownership ──────────────
const sameId = (a, b) => !!a && !!b && a.toString() === b.toString();
const isPassenger = (ride, user) => sameId(ride.passenger?._id || ride.passenger, user.id);
const isDriver    = (ride, user) => sameId(ride.driver?._id    || ride.driver,    user.id);
const isParticipant = (ride, user) => isPassenger(ride, user) || isDriver(ride, user);

const isValidCoordinates = (c) =>
  Array.isArray(c) && c.length === 2 && c.every(n => typeof n === "number" && Number.isFinite(n));

// ── Dynamic Fare Calculator ───────────────
// Fare = Base Fare + (Distance × Rate/km) + (Time × Rate/min) + ride type surcharge
const RIDE_TYPE_SURCHARGE = { economy: 0, ac: 50, bike: -50 };
const MINUTES_PER_KM_ESTIMATE = 3.5; // Lahore city traffic — same estimate as BookingScreen
const ROAD_DISTANCE_FACTOR    = 1.3; // straight-line → approximate road distance

const calculateFare = (distanceKm, durationMinutes = 0, isPooled = false, rideType = "economy") => {
  const BASE_FARE    = 80;
  const RATE_PER_KM  = 25;
  const RATE_PER_MIN = 5;
  const POOL_DISCOUNT = 100;

  const distanceFare  = distanceKm * RATE_PER_KM;
  const timeFare      = durationMinutes * RATE_PER_MIN;
  let fare            = BASE_FARE + distanceFare + timeFare + (RIDE_TYPE_SURCHARGE[rideType] || 0);
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
//  @route  POST /api/rides
// ════════════════════════════════════════
exports.bookRide = async (req, res) => {
  try {
    if (req.user.role !== "passenger") {
      return res.status(403).json({ success: false, message: "Only passengers can book rides" });
    }

    const {
      pickupAddress, pickupCoordinates,
      dropoffAddress, dropoffCoordinates,
      moodPreference, isPooled, rideType,
    } = req.body;

    if (!pickupAddress || !dropoffAddress || !isValidCoordinates(pickupCoordinates) || !isValidCoordinates(dropoffCoordinates)) {
      return res.status(400).json({ success: false, message: "Pickup and dropoff locations are required" });
    }

    const activeRide = await Ride.findOne({
      passenger: req.user.id,
      status: { $in: ACTIVE_STATUSES },
    });
    if (activeRide) {
      return res.status(400).json({ success: false, message: "You already have an active ride", rideId: activeRide._id });
    }

    // Distance is computed on the server — never trusted from the client.
    // Coordinates are [lng, lat].
    const straightKm = haversine(pickupCoordinates[1], pickupCoordinates[0], dropoffCoordinates[1], dropoffCoordinates[0]);
    const distanceKm = Math.max(1, Math.round(straightKm * ROAD_DISTANCE_FACTOR * 10) / 10);
    const type       = RIDE_TYPE_SURCHARGE[rideType] !== undefined ? rideType : "economy";
    const pooled     = isPooled === true;

    const fareDetails = calculateFare(distanceKm, Math.round(distanceKm * MINUTES_PER_KM_ESTIMATE), pooled, type);
    const otp = generateOTP();

    const ride = await Ride.create({
      passenger:       req.user.id,
      pickupLocation:  { address: pickupAddress,  coordinates: pickupCoordinates },
      dropoffLocation: { address: dropoffAddress, coordinates: dropoffCoordinates },
      distanceKm,
      estimatedFare:   fareDetails.total,
      fareBreakdown:   fareDetails,
      farePerPassenger: fareDetails.farePerPassenger,
      rideType:        type,
      moodPreference:  moodPreference || "quiet",
      isPooled:        pooled,
      maxPoolSize:     pooled ? 3 : 1,
      otp,
      status: "requested",
    });

    const passenger = await User.findById(req.user.id).select("guardianContacts name");
    const activeGuardians = (passenger.guardianContacts || []).filter(c => c.isActive);

    res.status(201).json({
      success: true,
      message: "Ride booked successfully! Finding your driver...",
      ride: {
        _id:             ride._id,
        otp,             // returned to the passenger only — hidden everywhere else
        estimatedFare:   ride.estimatedFare,
        fareBreakdown:   ride.fareBreakdown,
        farePerPassenger: ride.farePerPassenger,
        distanceKm:      ride.distanceKm,
        pickupLocation:  ride.pickupLocation,
        dropoffLocation: ride.dropoffLocation,
        status:          ride.status,
        rideType:        ride.rideType,
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
//  Only verified female drivers; atomic so two drivers can't both win
// ════════════════════════════════════════
exports.acceptRide = async (req, res) => {
  try {
    if (req.user.role !== "driver") {
      return res.status(403).json({ success: false, message: "Only drivers can accept rides" });
    }

    const driver = await User.findById(req.user.id);
    if (!driver.isVerified) {
      return res.status(403).json({ success: false, message: "Your account is pending admin approval" });
    }
    if (driver.gender !== "female") {
      return res.status(403).json({ success: false, message: "Only female drivers can accept rides on Mehfooz Ride" });
    }

    const busy = await Ride.exists({ driver: req.user.id, status: { $in: ACTIVE_STATUSES } });
    if (busy) {
      return res.status(400).json({ success: false, message: "Finish your current ride before accepting another" });
    }

    const ride = await Ride.findOneAndUpdate(
      { _id: req.params.id, status: "requested", driver: null },
      { driver: req.user.id, status: "accepted", acceptedAt: Date.now() },
      { new: true }
    );
    if (!ride) {
      return res.status(409).json({ success: false, message: "This ride is no longer available" });
    }

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
    if (!ride || !isDriver(ride, req.user)) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    if (ride.status !== "accepted") {
      return res.status(400).json({ success: false, message: `Cannot mark arrival while ride is ${ride.status}` });
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
    const ride = await Ride.findById(req.params.id).select("+otp");

    if (!ride || !isDriver(ride, req.user)) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    if (ride.status !== "arrived") {
      return res.status(400).json({ success: false, message: `Cannot verify OTP while ride is ${ride.status}` });
    }

    // ── Fake Ride Detection: Track OTP failures ──────────────────────────
    if (ride.otp !== String(otp || "")) {
      ride.otpFailureCount = (ride.otpFailureCount || 0) + 1;

      await User.findByIdAndUpdate(req.user.id, { $inc: { otpFailures: 1 } });

      if (ride.otpFailureCount >= 3) {
        // 3+ failures = auto-cancel, flag as possible fake ride
        ride.status            = "cancelled";
        ride.fakeRideSuspected = true;
        ride.cancelReason = `Ride cancelled: OTP verification failed ${ride.otpFailureCount} times — possible fake/unsafe ride`;
        ride.cancelledAt  = Date.now();
        await ride.save();

        await User.findByIdAndUpdate(req.user.id, { otpFailureFlagged: true });

        return res.status(400).json({
          success: false,
          message: `⚠️ Ride CANCELLED after ${ride.otpFailureCount} wrong OTP attempts. This incident has been reported to safety team.`,
          failureCount: ride.otpFailureCount,
          rideCancelled: true,
          incidentReported: true,
        });
      }
      await ride.save();

      const warningMessage = ride.otpFailureCount === 2
        ? `⚠️ 2nd wrong OTP. ONE more failure will cancel this ride and alert the safety team.`
        : `Wrong OTP (attempt ${ride.otpFailureCount}/3). Please verify the code with the passenger.`;

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
    if (!ride || !isDriver(ride, req.user)) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    if (ride.status !== "in_progress") {
      return res.status(400).json({ success: false, message: "Ride is not in progress" });
    }

    // ── Final fare using actual duration ──
    const durationMinutes = ride.startedAt
      ? Math.round((Date.now() - ride.startedAt.getTime()) / 60000)
      : 0;

    const fareDetails  = calculateFare(ride.distanceKm, durationMinutes, ride.isPooled, ride.rideType);
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
//  Passenger or assigned driver, before the ride has started
// ════════════════════════════════════════
exports.cancelRide = async (req, res) => {
  try {
    const { reason } = req.body;
    const ride = await Ride.findById(req.params.id);
    if (!ride || !isParticipant(ride, req.user)) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    if (!["requested", "accepted", "arrived"].includes(ride.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a ride that is ${ride.status}` });
    }
    ride.status       = "cancelled";
    ride.cancelReason = `${isDriver(ride, req.user) ? "Driver" : "Passenger"}: ${reason || "No reason given"}`;
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
const CATEGORY_KEYS = ["safety", "professionalism", "cleanliness", "punctuality", "respectful"];
const isStar = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

exports.submitRating = async (req, res) => {
  try {
    const { stars, categoryRatings, comment, hasComplaint, complaintType, complaintDetails } = req.body;
    if (!isStar(stars)) {
      return res.status(400).json({ success: false, message: "Stars must be a whole number from 1 to 5" });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride || !isPassenger(ride, req.user)) return res.status(404).json({ success: false, message: "Ride not found" });
    if (ride.status !== "completed") return res.status(400).json({ success: false, message: "Ride must be completed before rating" });
    if (ride.rating) return res.status(400).json({ success: false, message: "You have already rated this ride" });

    // Keep only valid 1–5 category scores
    const categories = {};
    CATEGORY_KEYS.forEach(k => {
      if (isStar(categoryRatings?.[k])) categories[k] = categoryRatings[k];
    });

    const rating = await Rating.create({
      ride: ride._id, ratedBy: req.user.id, ratedUser: ride.driver,
      stars, categoryRatings: categories,
      comment: comment || "", hasComplaint: hasComplaint === true,
      complaintType: complaintType || "", complaintDetails: complaintDetails || "",
    });
    ride.rating = rating._id;
    await ride.save();

    const driver = await User.findById(ride.driver);
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
//  Participants and admins only; OTP included for the passenger only
// ════════════════════════════════════════
exports.getRideById = async (req, res) => {
  try {
    const query = Ride.findById(req.params.id)
      .populate("driver",    "name phone averageRating driverDetails")
      .populate("passenger", "name phone guardianContacts")
      .populate("rating");

    const ride = await query.select("+otp");
    if (!ride || (!isParticipant(ride, req.user) && req.user.role !== "admin")) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }

    const out = ride.toObject();
    if (!isPassenger(ride, req.user)) delete out.otp;
    res.status(200).json({ success: true, ride: out });
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
    if (!ride || !isParticipant(ride, req.user)) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }

    ride.sosActivated = true;
    await ride.save();

    res.status(200).json({
      success: true,
      message: "SOS activated! Emergency contacts have been notified.",
      guardianContacts: ride.passenger.guardianContacts,
      driverInfo: ride.driver ? {
        name:         ride.driver.name,
        phone:        ride.driver.phone,
        licensePlate: ride.driver.driverDetails?.licensePlate,
        vehicle:      `${ride.driver.driverDetails?.vehicleMake || ""} ${ride.driver.driverDetails?.vehicleModel || ""}`.trim(),
      } : null,
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
    const ride = await Ride.findById(req.params.id);
    if (!ride || !isParticipant(ride, req.user)) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }

    const durationMinutes = ride.startedAt
      ? Math.round((Date.now() - ride.startedAt.getTime()) / 60000)
      : 0;

    const fareDetails = calculateFare(ride.distanceKm, durationMinutes, ride.isPooled, ride.rideType);

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
