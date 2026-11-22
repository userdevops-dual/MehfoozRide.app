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
const emergency    = require('../services/emergency');
const rideShare    = require('../services/rideShare');

// Guardian notifications live in services/rideShare.js (rides) and services/emergency.js (SOS)

const isValidCoordinates = (c) =>
  Array.isArray(c) && c.length === 2 && c.every(n => typeof n === 'number' && Number.isFinite(n));

const sameId = (a, b) => !!a && !!b && a.toString() === b.toString();

// Driver → pickup ETA from the real road route (routing service), refreshed at
// most every 45 s per ride; between refreshes it is scaled by how much closer
// the driver got. Falls back to a labelled straight-line estimate if routing fails.
const geo = require('../services/geo');
const etaCache = new Map();   // rideId → { at, km, min, straightKm }
const pickupEta = async (ride, coordinates) => {
  const id = String(ride._id);
  const straightKm = routeMonitor.distM(coordinates, ride.pickupLocation.coordinates) / 1000;
  let c = etaCache.get(id);
  if (!c || Date.now() - c.at > 45000) {
    try {
      const [lng, lat] = coordinates, [plng, plat] = ride.pickupLocation.coordinates;
      const r = (await geo.routes({ lat, lng }, { lat: plat, lng: plng }))[0];
      c = { at: Date.now(), km: r.distanceKm, min: r.durationMin, straightKm, source: 'road' };
    } catch {
      c = { at: Date.now(), km: straightKm * 1.3, min: straightKm * 1.3 * 3, straightKm, source: 'estimate' };
    }
    etaCache.set(id, c);
    if (etaCache.size > 2000) etaCache.delete(etaCache.keys().next().value);
  }
  const scale = c.straightKm > 0.05 ? Math.min(1.5, straightKm / c.straightKm) : 1;
  return {
    distanceKm: Math.round(c.km * scale * 10) / 10,
    etaMin: Math.max(1, Math.round(c.min * scale)),
    source: c.source,
  };
};

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
            io.to(passengerRoom).emit('driver:location:update', {
              rideId: ride._id, coordinates, timestamp: now, status: ride.status,
              toPickup: await pickupEta(ride, coordinates),
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
            // Guardians are told once per trip, on the first deviation (with the live link)
            if (!ride.routeDeviated) {
              rideShare.notifyGuardians(ride._id, 'route_deviation').then(results => {
                if (!results.length) return;
                const sent = results.filter(x => x.status === 'sent').length;
                io.to(passengerRoom).emit('guardian:notified', {
                  event: 'route_deviation',
                  message: sent
                    ? `Your guardians (${sent}) were sent your live trip link.`
                    : `Demo mode: your guardians' alert was logged, not sent. Use "Share trip" to send them your link.`,
                });
              });
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

        // Guardians are notified by the REST verify-otp endpoint (services/rideShare.js);
        // here the passenger just sees what actually happened.
        const latest = (await Ride.findById(rideId).select('guardianNotifications').lean())?.guardianNotifications?.filter(n => n.event === 'ride_started').pop();
        const notified = latest?.contacts || [];
        if (notified.length > 0) {
          io.to(passengerRoom).emit('guardian:notified', {
            event:   'ride_started',
            message: notified.some(c => c.status === 'sent')
              ? `🛡️ ${notified.filter(c => c.status === 'sent').length} guardian(s) were sent your live trip link.`
              : `🛡️ Demo mode: the guardian message was logged, not sent. Tap "Share trip" to send your live link yourself.`,
            contacts: notified.map(c => ({ name: c.name, status: c.status })),
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
      } catch (err) {
        console.error('Ride completed socket error:', err.message);
      }
    });

    // ── SOS EMERGENCY + guardian + admin ───────────────────────────────────
    socket.on('sos:activated', async ({ rideId, coordinates, accuracy } = {}) => {
      try {
        // Same workflow as POST /api/emergency (services/emergency.js)
        const { session } = await emergency.start({ userId, rideId: rideId || undefined, coordinates, accuracy });
        const v = emergency.view(session);
        socket.emit('sos:confirmed', {
          sessionId: v._id,
          contacts: v.contactNotifications.map(c => ({ name: c.name, status: c.status })),
          police: v.police,
        });
      } catch (err) {
        socket.emit('sos:error', { message: err.status ? err.message : 'SOS could not be recorded on the server — call 15 directly.' });
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
