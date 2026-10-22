// mehfooz-backend/socket/socket.js
// Real-time: Location, Ride Matching, SOS, Route Deviation + Guardian Alerts
//
// Every socket is authenticated with the user's JWT (socket.handshake.auth.token).
// Each user is joined to a room named after their user id, and admins also
// join the "admins" room. Handlers never trust user ids sent by the client —
// they check the authenticated user against the ride in the database.

const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const Ride = require('../models/Ride');
const routeMonitor = require('../services/routeMonitor');

// ── Guardian Notification Helper ─────────────────────────────────────────
// In production: call Twilio SMS / WhatsApp API here
const notifyGuardians = (guardianContacts, event, data) => {
  const active = (guardianContacts || []).filter(c => c.isActive);
  if (active.length === 0) return [];

  const messages = {
    ride_booked:      (d) => `🌸 [MehfoozRide] ${d.passengerName} has booked a ride. Driver will be assigned shortly.`,
    driver_assigned:  (d) => `🚗 [MehfoozRide] Driver ${d.driverName} (${d.licensePlate}) is on the way to pick up ${d.passengerName}.`,
    ride_started:     (d) => `✅ [MehfoozRide] ${d.passengerName}'s ride has STARTED with ${d.driverName} (${d.vehicle}). Pickup: ${d.pickup}`,
    ride_completed:   (d) => `🏁 [MehfoozRide] ${d.passengerName} has ARRIVED SAFELY at ${d.dropoff}. Fare: Rs.${d.fare}`,
    sos_alert:        (d) => `🆘 EMERGENCY! ${d.passengerName} activated SOS. Driver: ${d.driverName} | Plate: ${d.licensePlate}. Last known: ${JSON.stringify(d.coordinates)}`,
    route_deviation:  (d) => `⚠️ [MehfoozRide] ROUTE ALERT: ${d.passengerName}'s driver has deviated from the planned route. Tap SOS if needed.`,
  };

  const msg = messages[event] ? messages[event](data) : `[MehfoozRide] Update: ${event}`;

  active.forEach(c => {
    // In production: Twilio or Firebase SMS
    console.log(`📱 SMS to ${c.name} (${c.phone}): ${msg}`);
  });

  return active.map(c => ({ name: c.name, phone: c.phone }));
};

const isValidCoordinates = (c) =>
  Array.isArray(c) && c.length === 2 && c.every(n => typeof n === 'number' && Number.isFinite(n));

const sameId = (a, b) => !!a && !!b && a.toString() === b.toString();

// Drivers who lost their connection: userId → timer that sets them offline
const OFFLINE_GRACE_SECONDS = 60;
const pendingOffline = new Map();

const initSocket = (io) => {
  // ── AUTHENTICATION ───────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('name role isVerified isSuspended');
      if (!user)            return next(new Error('User not found'));
      if (user.isSuspended) return next(new Error('Account suspended'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    const role   = socket.user.role;

    socket.join(userId);
    if (role === 'admin') socket.join('admins');
    console.log(`🔌 Socket connected: ${socket.id} (${role} ${userId})`);

    // A driver who reconnects within the grace period stays online.
    // Either way, tell her app the real status so the screen matches the server.
    if (role === 'driver') {
      clearTimeout(pendingOffline.get(userId));
      pendingOffline.delete(userId);
      User.findById(userId).select('isOnline').then(u => {
        socket.emit('driver:status-updated', { isOnline: !!u?.isOnline, reason: 'reconnected' });
      }).catch(() => {});
    }

    // ── DRIVER LOCATION — every 5s ─────────────────────────────────────────
    // Updates the driver's position (used for matching nearby drivers) and,
    // for each of her active rides (several when pooled), forwards the
    // position to the passenger, records the track and checks the route.
    socket.on('driver:location', async ({ coordinates, rideId, rideIds, accuracy } = {}) => {
      try {
        if (role !== 'driver' || !isValidCoordinates(coordinates)) return;

        await User.findByIdAndUpdate(userId, {
          location: { type: 'Point', coordinates },
          locationUpdatedAt: new Date(),
        });

        const ids = [...new Set([...(Array.isArray(rideIds) ? rideIds : []), ...(rideId ? [rideId] : [])].map(String))].slice(0, 5);
        for (const id of ids) {
          const ride = await Ride.findById(id)
            .populate('passenger', 'name guardianContacts')
            .select('passenger driver pickupLocation dropoffLocation status routeDeviated routeDeviationActive preferredRoute estimatedDurationMinutes');

          if (!ride || !sameId(ride.driver, userId)) continue;
          if (!['accepted', 'arrived', 'in_progress'].includes(ride.status)) continue;

          const passengerRoom = ride.passenger._id.toString();
          const now = new Date();

          // Before pickup: how far the driver is from the passenger
          if (ride.status !== 'in_progress') {
            const km = routeMonitor.distM(coordinates, ride.pickupLocation.coordinates) / 1000;
            io.to(passengerRoom).emit('driver:location:update', {
              rideId: ride._id, coordinates, timestamp: now, status: ride.status,
              toPickup: { distanceKm: Math.round(km * 10) / 10, etaMin: Math.max(1, Math.round(km * 1.3 * 3)) },
            });
            continue;
          }

          // ── On trip: progress + unusual-route detection against the chosen route ──
          const { progress, event } = routeMonitor.check(ride, coordinates, Number(accuracy) || undefined);
          const update = {
            $push: { routeCoordinates: { coordinates, timestamp: now } },   // recorded track — used for the final fare
            $set:  { lastProgress: { ...progress, at: now } },
          };
          let active = ride.routeDeviationActive;

          if (event === 'deviated') {
            active = true;
            update.$set.routeDeviated = true;
            update.$set.routeDeviationActive = true;
            update.$push.routeDeviations = { startedAt: now, startLocation: coordinates, maxOffRouteM: progress.offRouteM, thresholdM: progress.thresholdM };
          } else if (event === 'back_on_route') {
            active = false;
            update.$set.routeDeviationActive = false;
            update.$set['routeDeviations.$[open].endedAt'] = now;
          }
          await Ride.updateOne({ _id: ride._id }, update,
            event === 'back_on_route' ? { arrayFilters: [{ 'open.endedAt': { $exists: false } }] } : {});
          if (active && event !== 'deviated') {
            // keep the worst distance of the current episode
            await Ride.updateOne({ _id: ride._id },
              { $max: { 'routeDeviations.$[open].maxOffRouteM': progress.offRouteM } },
              { arrayFilters: [{ 'open.endedAt': { $exists: false } }] });
          }

          io.to(passengerRoom).emit('driver:location:update', {
            rideId: ride._id, coordinates, timestamp: now, status: ride.status,
            progress, routeDeviationActive: active,
          });

          if (event === 'deviated') {
            const alert = {
              rideId: ride._id, status: 'deviated', coordinates, offRouteM: progress.offRouteM,
              message: `⚠️ Unusual route detected — the driver is about ${progress.offRouteM} m off your chosen route. Tap SOS if you feel unsafe.`,
            };
            io.to(passengerRoom).emit('ride:route-deviation', alert);
            io.to('admins').emit('admin:route-deviation', { ...alert, passengerName: ride.passenger.name });
            // Guardians are told once per trip, on the first deviation
            if (!ride.routeDeviated) {
              const notified = notifyGuardians(ride.passenger.guardianContacts, 'route_deviation', { passengerName: ride.passenger.name, coordinates });
              if (notified.length > 0) {
                io.to(passengerRoom).emit('guardian:notified', {
                  event: 'route_deviation',
                  message: `Your guardian contacts (${notified.length}) were alerted about the route change (demo: logged on the server, no SMS sent).`,
                });
              }
            }
          } else if (event === 'back_on_route') {
            io.to(passengerRoom).emit('ride:route-deviation', {
              rideId: ride._id, status: 'back_on_route', coordinates,
              message: '✅ The driver is back on your chosen route.',
            });
          }
        }      } catch (error) {
        console.error('Location update error:', error.message);
      }
    });

    // Ride requests are offered to drivers by the server when a ride is booked
    // (services/matching.js), and passengers are told about an accepted ride by
    // the accept endpoint — neither depends on a message from another app.

    // ── DRIVER ARRIVED ──────────────────────────────────────────────────────
    socket.on('ride:driver-arrived', async ({ rideId } = {}) => {
      try {
        const ride = await Ride.findById(rideId).select('passenger driver status');
        if (!ride || !sameId(ride.driver, userId) || ride.status !== 'arrived') return;

        io.to(ride.passenger.toString()).emit('ride:driver-at-pickup', {
          message: 'Your driver has arrived! Please come out 🌸',
        });
      } catch (err) {
        console.error('Driver arrived socket error:', err.message);
      }
    });

    // ── OTP VERIFIED (REST verify succeeded) — ride starts + guardian notification
    socket.on('ride:otp-verified', async ({ rideId } = {}) => {
      try {
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name guardianContacts')
          .populate('driver', 'name phone driverDetails');
        if (!ride || !sameId(ride.driver?._id, userId) || ride.status !== 'in_progress') return;

        const passengerRoom = ride.passenger._id.toString();
        io.to(passengerRoom).emit('ride:started', {
          rideId,
          message: 'Your ride has started! Enjoy the journey 🚗',
          startTime: ride.startedAt,
        });

        const notified = notifyGuardians(ride.passenger.guardianContacts, 'ride_started', {
          passengerName: ride.passenger.name,
          driverName:    ride.driver?.name || 'Driver',
          vehicle:       `${ride.driver?.driverDetails?.vehicleMake || ''} ${ride.driver?.driverDetails?.vehicleModel || ''}`.trim(),
          licensePlate:  ride.driver?.driverDetails?.licensePlate || 'N/A',
          pickup:        ride.pickupLocation?.address || '',
        });

        if (notified.length > 0) {
          io.to(passengerRoom).emit('guardian:notified', {
            event:   'ride_started',
            message: `🛡️ ${notified.length} guardian contact(s) notified your ride has started.`,
            contacts: notified,
          });
        }
      } catch (err) {
        console.error('OTP verified socket error:', err.message);
      }
    });

    // ── RIDE COMPLETE (REST complete succeeded) + guardian notification ─────
    socket.on('ride:completed', async ({ rideId } = {}) => {
      try {
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name guardianContacts');
        if (!ride || !sameId(ride.driver, userId) || ride.status !== 'completed') return;

        io.to(ride.passenger._id.toString()).emit('ride:finished', {
          rideId,
          fare:             ride.actualFare,
          farePerPassenger: ride.farePerPassenger,
          durationMinutes:  ride.durationMinutes,
          message: 'You have arrived safely! 🌸 Please rate your driver.',
        });

        notifyGuardians(ride.passenger.guardianContacts, 'ride_completed', {
          passengerName: ride.passenger.name,
          dropoff:       ride.dropoffLocation?.address || 'destination',
          fare:          ride.actualFare || 0,
        });
      } catch (err) {
        console.error('Ride completed socket error:', err.message);
      }
    });

    // ── SOS EMERGENCY + guardian + admin ───────────────────────────────────
    socket.on('sos:activated', async ({ rideId, coordinates } = {}) => {
      try {
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name phone guardianContacts')
          .populate('driver', 'name phone driverDetails');
        if (!ride) return;
        if (!sameId(ride.passenger._id, userId) && !sameId(ride.driver?._id, userId)) return;

        ride.sosActivated = true;
        await ride.save();

        const location = isValidCoordinates(coordinates) ? coordinates : null;

        notifyGuardians(ride.passenger.guardianContacts, 'sos_alert', {
          passengerName: ride.passenger.name,
          driverName:    ride.driver?.name || 'Driver',
          licensePlate:  ride.driver?.driverDetails?.licensePlate || 'N/A',
          coordinates:   location,
        });

        // Admins only — this payload contains phone numbers
        io.to('admins').emit('admin:sos-alert', {
          rideId,
          raisedBy:       role,
          passenger:      ride.passenger.name,
          passengerPhone: ride.passenger.phone,
          driver:         ride.driver?.name,
          driverPhone:    ride.driver?.phone,
          licensePlate:   ride.driver?.driverDetails?.licensePlate,
          coordinates:    location,
          timestamp:      new Date(),
        });

        socket.emit('sos:confirmed', {
          message: '🆘 SOS sent! Your emergency contacts and the safety team have been alerted.',
          guardianCount: (ride.passenger.guardianContacts || []).filter(c => c.isActive).length,
        });
      } catch (err) {
        console.error('SOS socket error:', err.message);
      }
    });

    // ── OTP FAILURE ALERT (fake ride detection) ────────────────────────────
    // The failure count is read from the database, not taken from the client.
    socket.on('ride:otp-failed', async ({ rideId } = {}) => {
      try {
        const ride = await Ride.findById(rideId).select('passenger driver status otpFailureCount');
        if (!ride || !sameId(ride.driver, userId)) return;

        const failureCount  = ride.otpFailureCount || 0;
        const passengerRoom = ride.passenger.toString();

        if (failureCount >= 2 || ride.status === 'cancelled') {
          io.to(passengerRoom).emit('ride:otp-warning', {
            message: `⚠️ Driver has entered the wrong OTP ${failureCount} time(s). If you feel unsafe, use SOS.`,
            failureCount,
          });
        }
        if (ride.status === 'cancelled') {
          io.to(passengerRoom).emit('ride:fake-ride-alert', {
            message: '🚨 Ride cancelled: Driver failed OTP verification 3 times. Incident reported to safety team.',
          });
          io.to('admins').emit('admin:fake-ride-alert', { rideId, failureCount, timestamp: new Date() });
        }
      } catch (err) {
        console.error('OTP failure socket error:', err.message);
      }
    });

    // ── DRIVER ONLINE/OFFLINE ──────────────────────────────────────────────
    socket.on('driver:toggle-online', async ({ isOnline } = {}) => {
      try {
        if (role !== 'driver') return;
        const driver = await User.findById(userId).select('isVerified');
        const online = !!isOnline && driver?.isVerified === true;
        await User.findByIdAndUpdate(userId, { isOnline: online });
        socket.emit('driver:status-updated', { isOnline: online });
        console.log(`Driver ${userId} → ${online ? '🟢 ONLINE' : '🔴 OFFLINE'}`);
      } catch (err) {
        console.error('Driver status error:', err.message);
      }
    });

    // ── DISCONNECT ─────────────────────────────────────────────────────────
    // A short network drop must not silently take a driver offline: wait a
    // grace period, and only go offline if she has not reconnected by then.
    socket.on('disconnect', async () => {
      if (role === 'driver') {
        const stillConnected = (await io.in(userId).fetchSockets()).length > 0;
        if (!stillConnected) {
          clearTimeout(pendingOffline.get(userId));
          pendingOffline.set(userId, setTimeout(async () => {
            pendingOffline.delete(userId);
            if ((await io.in(userId).fetchSockets()).length > 0) return;
            await User.findByIdAndUpdate(userId, { isOnline: false }).catch(() => {});
            console.log(`🔴 Driver ${userId} set offline after ${OFFLINE_GRACE_SECONDS}s without a connection`);
          }, OFFLINE_GRACE_SECONDS * 1000));
        }
      }
      console.log(`❌ Disconnected: ${userId}`);
    });
  });
};

module.exports = initSocket;
