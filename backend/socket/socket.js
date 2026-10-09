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
const { isDeviated } = require('../utils/routeDeviation');

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

    // ── DRIVER LOCATION — every 5s, with route deviation + guardian alert ──
    socket.on('driver:location', async ({ coordinates, rideId } = {}) => {
      try {
        if (role !== 'driver' || !isValidCoordinates(coordinates)) return;

        await User.findByIdAndUpdate(userId, {
          location: { type: 'Point', coordinates },
        });

        if (!rideId) return;

        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name guardianContacts')
          .select('passenger driver pickupLocation dropoffLocation status routeDeviated');

        if (!ride || !sameId(ride.driver, userId)) return;
        if (!['accepted', 'arrived', 'in_progress'].includes(ride.status)) return;

        const passengerRoom = ride.passenger._id.toString();

        // Send live location to passenger
        io.to(passengerRoom).emit('driver:location:update', {
          coordinates,
          timestamp: new Date(),
        });

        if (ride.status !== 'in_progress') return;

        // ── Route Deviation Monitoring + Guardian Alert ────────────────
        const deviated = isDeviated(
          coordinates,
          ride.pickupLocation.coordinates,
          ride.dropoffLocation.coordinates,
          0.5
        );

        if (deviated) {
          io.to(passengerRoom).emit('ride:route-deviation', {
            message: '⚠️ Driver has deviated from the planned route! Tap SOS if you feel unsafe.',
            coordinates,
          });

          if (!ride.routeDeviated) {
            await Ride.findByIdAndUpdate(rideId, { routeDeviated: true });

            const notified = notifyGuardians(
              ride.passenger.guardianContacts,
              'route_deviation',
              { passengerName: ride.passenger.name, coordinates }
            );

            if (notified.length > 0) {
              io.to(passengerRoom).emit('guardian:notified', {
                event: 'route_deviation',
                message: `⚠️ Your guardian contacts (${notified.length}) have been alerted about the route change.`,
              });
            }
          }
        }

        // Store route
        await Ride.findByIdAndUpdate(rideId, {
          $push: { routeCoordinates: { coordinates, timestamp: new Date() } },
        });
      } catch (error) {
        console.error('Location update error:', error.message);
      }
    });

    // ── NEW RIDE REQUEST — notify online verified female drivers ────────────
    socket.on('ride:new-request', async ({ rideId } = {}) => {
      try {
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name averageRating guardianContacts');
        if (!ride || !sameId(ride.passenger._id, userId) || ride.status !== 'requested') return;

        notifyGuardians(ride.passenger.guardianContacts, 'ride_booked', {
          passengerName: ride.passenger.name,
        });

        const drivers = await User.find({
          role: 'driver', gender: 'female',
          isVerified: true, isOnline: true, isSuspended: false,
        }).select('_id');

        drivers.forEach(driver => {
          io.to(driver._id.toString()).emit('ride:incoming', {
            rideId:          ride._id,
            passengerName:   ride.passenger.name,
            passengerRating: ride.passenger.averageRating,
            pickupAddress:   ride.pickupLocation.address,
            dropoffAddress:  ride.dropoffLocation.address,
            estimatedFare:   ride.estimatedFare,
            farePerPassenger: ride.farePerPassenger,
            distanceKm:      ride.distanceKm,
            moodPreference:  ride.moodPreference,
            isPooled:        ride.isPooled,
          });
        });
        console.log(`🚗 Ride ${rideId} broadcast to ${drivers.length} drivers`);
      } catch (err) {
        console.error('Ride request socket error:', err.message);
      }
    });

    // ── DRIVER ACCEPTED (after REST accept succeeded) — notify passenger + guardian
    socket.on('ride:accepted', async ({ rideId } = {}) => {
      try {
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name guardianContacts')
          .populate('driver', 'name phone averageRating driverDetails');
        if (!ride || !sameId(ride.driver?._id, userId) || ride.status !== 'accepted') return;

        const driver = ride.driver;
        io.to(ride.passenger._id.toString()).emit('ride:driver-found', {
          rideId,
          driver: {
            _id:          driver._id,
            name:         driver.name,
            phone:        driver.phone,
            rating:       driver.averageRating,
            vehicle:      `${driver.driverDetails?.vehicleMake || ''} ${driver.driverDetails?.vehicleModel || ''}`.trim(),
            vehicleColor: driver.driverDetails?.vehicleColor,
            licensePlate: driver.driverDetails?.licensePlate,
          },
        });

        notifyGuardians(ride.passenger.guardianContacts, 'driver_assigned', {
          passengerName: ride.passenger.name,
          driverName:    driver.name,
          licensePlate:  driver.driverDetails?.licensePlate || 'N/A',
        });
      } catch (err) {
        console.error('Ride accepted socket error:', err.message);
      }
    });

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
    socket.on('disconnect', async () => {
      if (role === 'driver') {
        await User.findByIdAndUpdate(userId, { isOnline: false }).catch(() => {});
      }
      console.log(`❌ Disconnected: ${userId}`);
    });
  });
};

module.exports = initSocket;
