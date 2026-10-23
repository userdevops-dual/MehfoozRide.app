// ─────────────────────────────────────────
//  controllers/rideController.js
//  Handles: Estimate, Book (+pooling, driver matching), Accept/Decline,
//  Arrive, OTP (with fake-ride detection), Complete, Cancel, Rate
//  Fare rules live in config/fare.js; matching/pooling in services/matching.js
// ─────────────────────────────────────────

const Ride     = require("../models/Ride");
const User     = require("../models/User");
const Rating   = require("../models/Rating");
const RidePool = require("../models/RidePool");
const config   = require("../config/appConfig");
const { haversine } = require("../utils/routeDeviation");
const geo      = require("../services/geo");
const matching = require("../services/matching");
const routeMonitor = require("../services/routeMonitor");
const emergency = require("../services/emergency");
const { driverVerification } = require("../services/verification");
const realtime = require("../services/realtime");
const { FARE, soloFare, poolEstimateFor, billableDistance, trackDistanceKm, validRideType } = require("../services/fare");
const { fromLngLat, inServiceArea } = require("../utils/geoValidation");

const ACTIVE_STATUSES = ["requested", "accepted", "arrived", "otp_verified", "in_progress"];
const MOODS = ["talkative", "quiet", "introvert"];

// ── Helper: Generate 4-digit OTP (new random code for every ride) ──
const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString();

// ── Helpers: ride ownership ──────────────
const sameId = (a, b) => !!a && !!b && a.toString() === b.toString();
const isPassenger = (ride, user) => sameId(ride.passenger?._id || ride.passenger, user.id);
const isDriver    = (ride, user) => sameId(ride.driver?._id    || ride.driver,    user.id);
const isParticipant = (ride, user) => isPassenger(ride, user) || isDriver(ride, user);

// fareBreakdown stored on the ride
const breakdown = (f, discount = 0) => ({
  baseFare: f.baseFare, distanceFare: f.distanceFare, timeFare: f.timeFare, discount,
});

// ── Route planning (server-side — distance is never trusted from the client) ──
// Real road routes from the routing service; if it is unreachable, a clearly
// marked straight-line estimate is used so booking still works.
const MIN_TRIP_KM = 0.3;

const planRoutes = async (pickup, dropoff) => {
  try {
    const routes = await geo.routes(pickup, dropoff);
    return { source: "osrm", routes };
  } catch (e) {
    const straightKm = haversine(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    const distanceKm = Math.max(1, Math.round(straightKm * FARE.fallback.roadDistanceFactor * 10) / 10);
    return {
      source: "straight_line",
      warning: "Road routing is unavailable right now — distance and time are approximate.",
      routes: [{
        index: 0, distanceKm, summary: "Approximate (straight line)",
        durationMin: Math.round(distanceKm * FARE.fallback.minutesPerKm),
        coordinates: [[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]],
      }],
    };
  }
};

// Validates [lng, lat] pickup/dropoff from the request body
const readTripPoints = (body) => {
  const pickup  = fromLngLat(body.pickupCoordinates);
  const dropoff = fromLngLat(body.dropoffCoordinates);
  if (!pickup || !dropoff) return { error: "Pickup and destination locations are required." };
  if (!inServiceArea(pickup) || !inServiceArea(dropoff)) return { error: "Mehfooz Ride currently operates in Pakistan only." };
  if (haversine(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng) < MIN_TRIP_KM) {
    return { error: "Pickup and destination are too close together." };
  }
  return { pickup, dropoff };
};

// ════════════════════════════════════════
//  @route  POST /api/rides/estimate
//  Real routes (with alternatives) + server-calculated fare for each.
//  poolFare = what the passenger would pay if one similar passenger joins.
// ════════════════════════════════════════
exports.estimateRide = async (req, res) => {
  try {
    const { pickup, dropoff, error } = readTripPoints(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const type = validRideType(req.body.rideType);
    const plan = await planRoutes(pickup, dropoff);

    res.json({
      success: true,
      source:  plan.source,
      warning: plan.warning,
      routes:  plan.routes.map(r => {
        const f = soloFare(r.distanceKm, r.durationMin, type);
        return {
          ...r,
          fare: { ...breakdown(f), surcharge: f.surcharge, total: f.total, farePerPassenger: f.total },
          poolFare: poolEstimateFor(r.distanceKm, r.durationMin, type),
        };
      }),
    });
  } catch (error) {
    console.error("Estimate error:", error.message);
    res.status(500).json({ success: false, message: "Could not estimate this ride." });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/rides
//  Books, tries to pool (if the passenger consented) and offers the request
//  to the nearest eligible drivers. The request expires automatically.
// ════════════════════════════════════════
exports.bookRide = async (req, res) => {
  try {
    // Drivers may also ride as passengers, but not while online for ride requests
    if (!["passenger", "driver"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Only passengers can book rides" });
    }
    if (req.user.role === "driver" && req.user.isOnline) {
      return res.status(400).json({ success: false, message: "Go offline in driver mode before booking a ride as a passenger." });
    }

    const { pickupAddress, pickupCoordinates, dropoffAddress, dropoffCoordinates,
            moodPreference, isPooled, rideType, routeIndex } = req.body;

    if (!pickupAddress || !dropoffAddress) {
      return res.status(400).json({ success: false, message: "Pickup and dropoff locations are required" });
    }
    if (moodPreference !== undefined && !MOODS.includes(moodPreference)) {
      return res.status(400).json({ success: false, message: "Mood must be talkative, quiet or introvert." });
    }
    const { error } = readTripPoints(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    // Old unaccepted requests are expired first, so they never block a new booking
    await matching.expireRequests({ passenger: req.user._id });
    const activeRide = await Ride.findOne({ passenger: req.user.id, status: { $in: ACTIVE_STATUSES } });
    if (activeRide) {
      return res.status(400).json({ success: false, message: "You already have an active ride", rideId: activeRide._id });
    }

    // Route chosen by the passenger — recalculated here, never taken from the client
    const { pickup, dropoff } = readTripPoints(req.body);
    const plan  = await planRoutes(pickup, dropoff);
    const route = plan.routes[Number.isInteger(routeIndex) ? routeIndex : 0] || plan.routes[0];
    const type  = validRideType(rideType);
    const fare  = soloFare(route.distanceKm, route.durationMin, type);

    const ride = await Ride.create({
      passenger:       req.user.id,
      pickupLocation:  { address: pickupAddress,  coordinates: pickupCoordinates },
      dropoffLocation: { address: dropoffAddress, coordinates: dropoffCoordinates },
      distanceKm:      route.distanceKm,
      estimatedDurationMinutes: route.durationMin,
      preferredRoute: {
        source:      plan.source,
        index:       route.index,
        distanceKm:  route.distanceKm,
        durationMin: route.durationMin,
        summary:     route.summary,
        coordinates: route.coordinates.map(([lat, lng]) => [lng, lat]),
      },
      estimatedFare:    fare.total,
      soloFare:         fare.total,
      fareBreakdown:    breakdown(fare),
      farePerPassenger: fare.total,
      rideType:         type,
      moodPreference:   moodPreference || "quiet",
      isPooled:         isPooled === true,
      maxPoolSize:      isPooled === true ? FARE.pool.maxPassengers : 1,
      otp:              generateOTP(),
      status:           "requested",
      requestExpiresAt: new Date(Date.now() + config.matching.requestTimeoutSeconds * 1000),
    });

    // Pool with a compatible consenting passenger (if any), then offer to drivers
    const pooled = await matching.tryPool(ride);
    const lead   = await matching.leadRideOf(await Ride.findById(ride._id));
    const driversNotified = await matching.offerToDrivers(lead._id);

    const fresh = await Ride.findById(ride._id).select("+otp");
    const passenger = await User.findById(req.user.id).select("guardianContacts");
    const activeGuardians = (passenger.guardianContacts || []).filter(c => c.isActive);

    res.status(201).json({
      success: true,
      message: "Ride booked! Finding your driver...",
      ride: {
        _id:              fresh._id,
        otp:              fresh.otp,   // returned to the passenger only — hidden everywhere else
        estimatedFare:    fresh.estimatedFare,
        soloFare:         fresh.soloFare,
        fareBreakdown:    fresh.fareBreakdown,
        farePerPassenger: fresh.farePerPassenger,
        distanceKm:       fresh.distanceKm,
        estimatedDurationMinutes: fresh.estimatedDurationMinutes,
        preferredRoute:   fresh.preferredRoute,
        pickupLocation:   fresh.pickupLocation,
        dropoffLocation:  fresh.dropoffLocation,
        status:           fresh.status,
        rideType:         fresh.rideType,
        moodPreference:   fresh.moodPreference,
        isPooled:         fresh.isPooled,
        pool:             fresh.pool,
        requestExpiresAt: fresh.requestExpiresAt,
      },
      pool: pooled ? { passengers: pooled.passengers, yourFare: fresh.farePerPassenger, soloFare: fresh.soloFare } : null,
      driversNotified,
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
//  Verified female drivers only; atomic so two drivers can't both win.
//  Accepting a pooled request assigns every passenger in the pool.
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

    const requested = await Ride.findById(req.params.id);
    const unavailable = () => res.status(409).json({ success: false, message: "This ride is no longer available" });
    if (!requested || requested.status !== "requested" || requested.driver) return unavailable();
    if (requested.requestExpiresAt && requested.requestExpiresAt < new Date()) return unavailable();
    if (requested.declinedBy.some(id => sameId(id, req.user.id))) return unavailable();

    const now = Date.now();
    let rideIds;
    if (requested.pool) {
      // Lock the pool first — only one driver can win this update
      const pool = await RidePool.findOneAndUpdate(
        { _id: requested.pool, status: "open" },
        { status: "locked", driver: req.user.id },
        { new: true }
      );
      if (!pool) return unavailable();
      await Ride.updateMany(
        { _id: { $in: pool.rides }, status: "requested", driver: null },
        { driver: req.user.id, status: "accepted", acceptedAt: now }
      );
      rideIds = pool.rides;
    } else {
      const claimed = await Ride.findOneAndUpdate(
        { _id: requested._id, status: "requested", driver: null },
        { driver: req.user.id, status: "accepted", acceptedAt: now },
        { new: true }
      );
      if (!claimed) return unavailable();
      rideIds = [claimed._id];
    }

    const rides = await Ride.find({ _id: { $in: rideIds }, driver: req.user.id, status: "accepted" })
      .populate("passenger", "name phone guardianContacts")
      .sort({ createdAt: 1 });
    if (!rides.length) return unavailable();

    const verification = driverVerification(driver);
    const driverInfo = {
      _id:          driver._id,
      name:         driver.name,
      phone:        driver.phone,
      rating:       driver.totalRatings ? driver.averageRating : null,
      totalRides:   driver.totalRides,
      verified:     verification.verified,
      verification,                       // which checks passed, and whether this is demo data
      photo:        driver.profilePhoto || null,
      vehicle:      `${driver.driverDetails?.vehicleMake || ""} ${driver.driverDetails?.vehicleModel || ""}`.trim(),
      vehicleColor: driver.driverDetails?.vehicleColor,
      licensePlate: driver.driverDetails?.licensePlate,
    };

    for (const r of rides) {
      // The server tells each passenger directly (does not depend on the driver's app)
      realtime.toUser(r.passenger._id, "ride:driver-found", {
        rideId: r._id, driver: driverInfo,
        pool: rides.length > 1 ? { passengers: rides.length, yourFare: r.farePerPassenger } : null,
      });
      const guardians = (r.passenger.guardianContacts || []).filter(c => c.isActive);
      if (guardians.length) {
        console.log(`📱 [DEMO — SMS NOT SENT] Guardian notice: driver assigned for ${r.passenger.name}`);
        guardians.forEach(g => console.log(`  → ${g.name} (${g.phone}): Driver ${driver.name} | ${driverInfo.licensePlate} is on the way`));
      }
      matching.withdrawOffer(r, "accepted_by_other_driver", req.user.id);
    }

    // Driver-facing view: no guardian contacts, no OTPs
    const stops = rides.map(r => ({
      rideId:            r._id,
      passengerName:     r.passenger.name,
      passengerPhone:    r.passenger.phone,
      pickupAddress:     r.pickupLocation.address,
      pickupCoordinates: r.pickupLocation.coordinates,
      dropoffAddress:    r.dropoffLocation.address,
      dropoffCoordinates: r.dropoffLocation.coordinates,
      fare:              r.farePerPassenger || r.estimatedFare,
      distanceKm:        r.distanceKm,
      durationMin:       r.estimatedDurationMinutes,
      moodPreference:    r.moodPreference,
      status:            r.status,
    }));

    res.status(200).json({
      success: true,
      message: rides.length > 1 ? `Pool accepted — ${rides.length} passengers. Navigate to the first pickup.` : "Ride accepted! Navigate to pickup location.",
      isPooled: rides.length > 1,
      stops,
      ride: stops[0],
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  PUT /api/rides/:id/decline
//  The request will not be offered to this driver again
// ════════════════════════════════════════
exports.declineRide = async (req, res) => {
  try {
    if (req.user.role !== "driver") return res.status(403).json({ success: false, message: "Only drivers can decline rides" });
    const ride = await Ride.findOneAndUpdate(
      { _id: req.params.id, status: "requested" },
      { $addToSet: { declinedBy: req.user._id } },
      { new: true }
    );
    if (!ride) return res.status(404).json({ success: false, message: "Request not found or no longer open" });
    if (ride.pool) await Ride.updateMany({ pool: ride.pool, status: "requested" }, { $addToSet: { declinedBy: req.user._id } });
    res.json({ success: true, message: "Request declined" });
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
        await matching.leavePool(ride);

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
      console.log(`🛡️ [DEMO — SMS NOT SENT] Guardian notice: ${fullRide.passenger.name}'s ride has started`);
      activeGuardians.forEach(g => {
        console.log(`  → ${g.name} (${g.phone}): Ride started | Driver: ${fullRide.driver?.name} | Plate: ${fullRide.driver?.driverDetails?.licensePlate}`);
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
//  Final fare from the actual trip: GPS distance (when the recorded track is
//  complete enough, otherwise the planned route) + actual duration.
//  Pooled passengers keep the pool discount ratio agreed when the pool formed.
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

    const durationMinutes = ride.startedAt
      ? Math.max(1, Math.round((Date.now() - ride.startedAt.getTime()) / 60000))
      : 0;
    const billed = billableDistance(ride.distanceKm, ride.routeCoordinates);
    const finalSolo = soloFare(billed.distanceKm, durationMinutes, ride.rideType);

    // Pool: same share ratio as agreed (share / solo at booking)
    let payable = finalSolo.total;
    let discount = 0;
    if (ride.pool && ride.soloFare > 0 && ride.farePerPassenger < ride.soloFare) {
      const ratio = ride.farePerPassenger / ride.soloFare;
      payable  = Math.round(Math.min(finalSolo.total, Math.max(FARE.pool.minimumShare, finalSolo.total * ratio)));
      discount = finalSolo.total - payable;
    }

    // Guarded update so a repeated "complete" request can't apply twice
    const done = await Ride.findOneAndUpdate(
      { _id: ride._id, status: "in_progress" },
      {
        status: "completed", completedAt: Date.now(),
        durationMinutes,
        billedDistanceKm: billed.distanceKm,
        distanceSource:   billed.source,
        actualFare:       payable,
        farePerPassenger: payable,
        fareBreakdown:    breakdown(finalSolo, discount),
      },
      { new: true }
    );
    if (!done) return res.status(400).json({ success: false, message: "Ride is not in progress" });

    // Close a deviation episode still open at drop-off
    routeMonitor.forget(done._id);
    if (done.routeDeviationActive) {
      await Ride.updateOne({ _id: done._id },
        { $set: { routeDeviationActive: false, "routeDeviations.$[open].endedAt": new Date() } },
        { arrayFilters: [{ "open.endedAt": { $exists: false } }] });
    }

    await User.findByIdAndUpdate(req.user.id, { $inc: { totalRides: 1 } });
    await User.findByIdAndUpdate(ride.passenger, { $inc: { totalRides: 1 } });

    // Close the pool when nobody is left riding
    if (ride.pool) {
      const stillActive = await Ride.exists({ pool: ride.pool, status: { $in: ACTIVE_STATUSES } });
      if (!stillActive) await RidePool.updateOne({ _id: ride.pool }, { status: "closed" });
    }

    // ── Notify guardians ride is complete ──
    const fullRide = await Ride.findById(ride._id).populate("passenger", "name phone guardianContacts");
    const activeGuardians = (fullRide.passenger.guardianContacts || []).filter(c => c.isActive);
    if (activeGuardians.length > 0) {
      console.log(`✅ [DEMO — SMS NOT SENT] Guardian notice: ${fullRide.passenger.name} arrived safely`);
      activeGuardians.forEach(g => console.log(`  → ${g.name} (${g.phone}): ${fullRide.passenger.name} has arrived safely!`));
    }

    res.status(200).json({
      success: true,
      message: "Ride completed successfully! 🌸",
      ride: {
        _id:              done._id,
        actualFare:       done.actualFare,
        farePerPassenger: done.farePerPassenger,
        fareBreakdown:    done.fareBreakdown,
        durationMinutes,
        distanceKm:       billed.distanceKm,
        distanceSource:   billed.source,
        plannedDistanceKm: ride.distanceKm,
        isPooled:         !!ride.pool,
        status:           done.status,
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
    const byDriver = isDriver(ride, req.user);
    const wasRequested = ride.status === "requested";
    ride.status       = "cancelled";
    ride.cancelReason = `${byDriver ? "Driver" : "Passenger"}: ${reason || "No reason given"}`;
    ride.cancelledAt  = Date.now();
    await ride.save();

    if (wasRequested) matching.withdrawOffer(ride, "cancelled");
    await matching.leavePool(ride);
    // Let the other side know
    if (byDriver) realtime.toUser(ride.passenger, "ride:cancelled", { rideId: ride._id, by: "driver", message: "Your driver cancelled this ride. You have not been charged." });
    else if (ride.driver) realtime.toUser(ride.driver, "ride:cancelled", { rideId: ride._id, by: "passenger", message: "The passenger cancelled this ride." });

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
    // ?as=passenger lets a driver see the rides she took as a passenger
    const asDriver = req.user.role === "driver" && req.query.as !== "passenger";
    const query = asDriver ? { driver: req.user.id } : { passenger: req.user.id };
    const rides = await Ride.find(query)
      .select("-routeCoordinates -preferredRoute.coordinates")
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
//  Participants and admins only. OTP and guardian contacts are included for
//  the passenger herself (and admins) only — never for the driver.
// ════════════════════════════════════════
// Status lifecycle in the terms of the requirements, with the time each step happened
const lifecycleOf = (ride) => {
  const steps = [
    ["REQUESTED",        ride.requestedAt],
    ["DRIVER_ASSIGNED",  ride.acceptedAt],
    ["DRIVER_AT_PICKUP", ride.arrivedAt],
    ["OTP_VERIFIED",     ride.otpVerified ? ride.startedAt : null],
    ["RIDE_IN_PROGRESS", ride.startedAt],
    ["RIDE_COMPLETED",   ride.completedAt],
  ].map(([step, at]) => ({ step, at: at || null, done: !!at }));
  const current = ride.status === "cancelled" ? "CANCELLED" : ([...steps].reverse().find(s => s.done)?.step || "REQUESTED");
  return { current, steps };
};

exports.getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate("driver",    "name phone averageRating totalRatings totalRides profilePhoto isVerified cnicVerified driverDetails")
      .populate("passenger", "name phone guardianContacts")
      .populate("rating")
      .select("+otp");
    if (!ride || (!isParticipant(ride, req.user) && req.user.role !== "admin")) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }

    const out = ride.toObject();
    const passengerSelf = isPassenger(ride, req.user);
    if (!passengerSelf) delete out.otp;
    if (!passengerSelf && req.user.role !== "admin" && out.passenger) delete out.passenger.guardianContacts;
    if (ride.driver) out.driverVerification = driverVerification(ride.driver);
    out.lifecycle = lifecycleOf(ride);
    out.plannedRoute = routeMonitor.plannedLine(ride);   // [[lng, lat], ...] for the map
    if (out.driver?.driverDetails && req.user.role !== "admin") {
      // document keys, CNIC and licence numbers are for admins only
      for (const k of ["cnicPhoto", "licensePhoto", "registrationPhoto", "cnicNumber", "licenseNumber", "backgroundNotes"]) delete out.driver.driverDetails[k];
    }
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
    // Same workflow as POST /api/emergency
    const { session, created } = await emergency.start({
      userId: req.user.id, rideId: req.params.id, coordinates: req.body?.coordinates, accuracy: req.body?.accuracy,
    });
    res.status(created ? 201 : 200).json({ success: true, created, session: emergency.view(session) });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};
// ════════════════════════════════════════
//  @route  GET /api/rides/:id/live-fare
//  Running fare from the GPS track so far + elapsed time (same rules as the final fare)
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
    const travelledKm = trackDistanceKm(ride.routeCoordinates);
    const f = soloFare(travelledKm, durationMinutes, ride.rideType);
    const ratio = ride.pool && ride.soloFare > 0 ? ride.farePerPassenger / ride.soloFare : 1;

    res.status(200).json({
      success: true,
      liveFare: Math.round(f.total * ratio),
      soloFare: f.total,
      travelledKm,
      durationMinutes,
      fareBreakdown: breakdown(f),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  SAFE POINTS — real map locations the passenger marks for this trip
//  POST   /api/rides/:id/safe-points                    { name, type, address, coordinates:[lng,lat], source }
//  DELETE /api/rides/:id/safe-points/:pointId
//  POST   /api/rides/:id/safe-points/:pointId/request   "take me there" → driver gets the point + route
//  PUT    /api/rides/:id/safe-point-ack                 driver acknowledges the request
// ════════════════════════════════════════
const SAFE_POINT_STATUSES = ["requested", "accepted", "arrived", "in_progress"];
const SAFE_TYPES = ["police", "hospital", "public", "other"];

const safePointView = (p) => ({
  _id: p._id, name: p.name, type: p.type, address: p.address, source: p.source, addedAt: p.addedAt,
  coordinates: p.coordinates,
});

exports.addSafePoint = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride || !isPassenger(ride, req.user)) return res.status(404).json({ success: false, message: "Ride not found" });
    if (!SAFE_POINT_STATUSES.includes(ride.status)) return res.status(400).json({ success: false, message: "Safe points can only be marked on an active ride" });
    const { name, type, address, coordinates, source } = req.body || {};
    const c = Array.isArray(coordinates) ? coordinates.map(Number) : null;
    if (!c || c.length !== 2 || !c.every(Number.isFinite) || !inServiceArea(fromLngLat(c))) {
      return res.status(400).json({ success: false, message: "A valid map location [lng, lat] in Pakistan is required" });
    }
    const label = String(name || "").trim().slice(0, 120);
    if (!label) return res.status(400).json({ success: false, message: "Give the safe point a name" });
    if (ride.safePoints.length >= config.safePlaces.maxPerRide) {
      return res.status(400).json({ success: false, message: `You can mark up to ${config.safePlaces.maxPerRide} safe points per ride` });
    }
    ride.safePoints.push({
      name: label,
      type: SAFE_TYPES.includes(type) ? type : "other",
      address: String(address || "").slice(0, 300),
      coordinates: c,
      source: ["osm", "search", "map"].includes(source) ? source : "map",
    });
    await ride.save();
    const points = ride.safePoints.map(safePointView);
    if (ride.driver) realtime.toUser(ride.driver, "ride:safe-points-updated", { rideId: ride._id, safePoints: points });
    res.status(201).json({ success: true, safePoints: points });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.removeSafePoint = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride || !isPassenger(ride, req.user)) return res.status(404).json({ success: false, message: "Ride not found" });
    const before = ride.safePoints.length;
    ride.safePoints = ride.safePoints.filter(p => String(p._id) !== String(req.params.pointId));
    if (ride.safePoints.length === before) return res.status(404).json({ success: false, message: "Safe point not found" });
    if (String(ride.safePointRequest?.pointId) === String(req.params.pointId)) ride.safePointRequest = undefined;
    await ride.save();
    const points = ride.safePoints.map(safePointView);
    if (ride.driver) realtime.toUser(ride.driver, "ride:safe-points-updated", { rideId: ride._id, safePoints: points });
    res.json({ success: true, safePoints: points });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.requestSafePoint = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id).populate("passenger", "name");
    if (!ride || !isPassenger(ride, req.user)) return res.status(404).json({ success: false, message: "Ride not found" });
    if (!ride.driver || !["accepted", "arrived", "in_progress"].includes(ride.status)) {
      return res.status(400).json({ success: false, message: "There is no driver on this ride yet" });
    }
    const point = ride.safePoints.id(req.params.pointId);
    if (!point) return res.status(404).json({ success: false, message: "Safe point not found" });

    ride.safePointRequest = { pointId: point._id, requestedAt: new Date() };
    await ride.save();

    // Navigation: road route from the driver's last GPS position to the safe point
    const driver = await User.findById(ride.driver).select("location locationUpdatedAt");
    let route = null;
    const from = driver?.locationUpdatedAt ? fromLngLat(driver.location.coordinates) : null;
    if (from) {
      try {
        const r = (await geo.routes(from, fromLngLat(point.coordinates)))[0];
        route = { distanceKm: r.distanceKm, durationMin: r.durationMin, coordinates: r.coordinates, source: "osrm" };
      } catch (e) {
        const km = haversine(from.lat, from.lng, point.coordinates[1], point.coordinates[0]);
        route = { distanceKm: Math.round(km * 10) / 10, durationMin: null, coordinates: null, source: "straight_line" };
      }
    }
    const payload = { rideId: ride._id, passengerName: ride.passenger.name, point: safePointView(point), route, requestedAt: ride.safePointRequest.requestedAt };
    realtime.toUser(ride.driver, "ride:safe-point-requested", payload);
    realtime.toAdmins("admin:safe-point-requested", payload);
    res.json({ success: true, ...payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.acknowledgeSafePoint = async (req, res) => {
  try {
    const ride = await Ride.findOneAndUpdate(
      { _id: req.params.id, driver: req.user.id, "safePointRequest.pointId": { $exists: true } },
      { "safePointRequest.acknowledgedAt": new Date() },
      { new: true }
    );
    if (!ride) return res.status(404).json({ success: false, message: "No safe-point request on this ride" });
    const point = ride.safePoints.id(ride.safePointRequest.pointId);
    realtime.toUser(ride.passenger, "ride:safe-point-acknowledged", { rideId: ride._id, point: point && safePointView(point) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
