// services/rideShare.js — Guardian Mode for normal rides.
//
// Every ride gets a private, random live-tracking link. Guardians (the
// passenger's active emergency contacts) are told when a driver is assigned,
// when the trip starts and when she arrives — through services/notifier.js,
// which reports honestly whether a message was really sent ("sent") or only
// logged in demo mode ("simulated"). The passenger can also share the link
// herself from the app. The link stops working a while after the ride ends.
const crypto = require("crypto");
const config = require("../config/appConfig");
const Ride = require("../models/Ride");
const { notifyContacts } = require("./notifier");
const routeMonitor = require("./routeMonitor");

const KEEP_AFTER_END_MS = 2 * 3600 * 1000;    // link works 2 h after the ride ends

const newToken = () => crypto.randomBytes(18).toString("base64url");

const linkPath = (token) => `/api/rides/live/${token}`;
const fullLink = (token) => {
  const base = config.emergency.publicBaseUrl;
  return base ? `${base.replace(/\/$/, "")}${linkPath(token)}` : linkPath(token);
};

// Give a ride its link (called at booking; idempotent)
const ensureToken = async (rideId) => {
  const token = newToken();
  const r = await Ride.findOneAndUpdate({ _id: rideId, shareToken: { $exists: false } }, { shareToken: token }, { new: true });
  return r ? r.shareToken : (await Ride.findById(rideId).select("shareToken"))?.shareToken;
};

const MESSAGES = {
  driver_assigned: (r) => `🌸 Mehfooz Ride: ${r.passenger.name}'s driver ${r.driver?.name} (${plate(r)}) is on the way to pick her up. Follow the trip: ${fullLink(r.shareToken)}`,
  ride_started:    (r) => `🚗 Mehfooz Ride: ${r.passenger.name}'s trip has started with ${r.driver?.name} (${plate(r)}), going to ${r.dropoffLocation?.address}. Live location: ${fullLink(r.shareToken)}`,
  ride_completed:  (r) => `✅ Mehfooz Ride: ${r.passenger.name} has arrived at ${r.dropoffLocation?.address}.`,
  route_deviation: (r) => `⚠️ Mehfooz Ride: ${r.passenger.name}'s driver has left the chosen route. Live location: ${fullLink(r.shareToken)}`,
};
const plate = (r) => r.driver?.driverDetails?.licensePlate || "plate not set";

/**
 * Notify the passenger's active guardians about a ride event and record the
 * real delivery status on the ride. Never throws (ride flow must not fail).
 */
const notifyGuardians = async (rideId, event) => {
  try {
    const r = await Ride.findById(rideId)
      .populate("passenger", "name guardianContacts")
      .populate("driver", "name driverDetails.licensePlate");
    const contacts = (r?.passenger?.guardianContacts || []).filter(c => c.isActive);
    if (!r || !contacts.length || !MESSAGES[event]) return [];
    if (!r.shareToken) r.shareToken = await ensureToken(r._id);
    const results = await notifyContacts(contacts, MESSAGES[event](r));
    await Ride.updateOne({ _id: r._id }, {
      $push: { guardianNotifications: {
        event, sentAt: new Date(),
        contacts: results.map(x => ({ name: x.name, phone: x.phone, status: x.status, detail: x.detail })),
      } },
    });
    return results;
  } catch (e) {
    console.error("Guardian notification error:", e.message);
    return [];
  }
};

// What a guardian sees (no phone numbers, no OTP, no exact pickup history beyond the trip)
const publicView = async (token) => {
  const r = await Ride.findOne({ shareToken: String(token) })
    .select("status pickupLocation dropoffLocation preferredRoute pickupLocation lastProgress routeDeviationActive routeDeviated startedAt completedAt cancelledAt acceptedAt sosActivated passenger driver estimatedDurationMinutes routeCoordinates distanceKm")
    .populate("passenger", "name")
    .populate("driver", "name location locationUpdatedAt driverDetails.vehicleMake driverDetails.vehicleModel driverDetails.vehicleColor driverDetails.licensePlate");
  if (!r) return null;
  const ended = r.completedAt || r.cancelledAt;
  if (ended && Date.now() - new Date(ended).getTime() > KEEP_AFTER_END_MS) return null;

  const active = ["accepted", "arrived", "otp_verified", "in_progress"].includes(r.status);
  const fresh = r.driver?.locationUpdatedAt && Date.now() - new Date(r.driver.locationUpdatedAt).getTime() < 5 * 60 * 1000;
  const firstName = (r.passenger?.name || "").split(" ")[0];
  return {
    passenger: firstName,
    status: r.status,
    pickup: r.pickupLocation?.address,
    dropoff: r.dropoffLocation?.address,
    dropoffAt: r.dropoffLocation?.coordinates ? [r.dropoffLocation.coordinates[1], r.dropoffLocation.coordinates[0]] : null,
    pickupAt: r.pickupLocation?.coordinates ? [r.pickupLocation.coordinates[1], r.pickupLocation.coordinates[0]] : null,
    driver: r.driver ? {
      name: r.driver.name,
      vehicle: [r.driver.driverDetails?.vehicleColor, r.driver.driverDetails?.vehicleMake, r.driver.driverDetails?.vehicleModel].filter(Boolean).join(" "),
      licensePlate: r.driver.driverDetails?.licensePlate || "",
    } : null,
    // Live position only while the ride is active and the driver's GPS is recent
    driverAt: active && fresh ? [r.driver.location.coordinates[1], r.driver.location.coordinates[0]] : null,
    driverAtTime: active && fresh ? r.driver.locationUpdatedAt : null,
    plannedRoute: routeMonitor.plannedLine(r).map(([lng, lat]) => [lat, lng]),
    trail: (r.routeCoordinates || []).slice(-300).map(p => [p.coordinates[1], p.coordinates[0]]),
    progress: r.status === "in_progress" ? r.lastProgress : null,
    offRoute: !!r.routeDeviationActive,
    routeDeviated: !!r.routeDeviated,
    sosActivated: !!r.sosActivated,
    startedAt: r.startedAt, completedAt: r.completedAt,
  };
};

module.exports = { ensureToken, notifyGuardians, publicView, fullLink, linkPath };
