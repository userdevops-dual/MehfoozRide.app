// mehfooz-backend/socket/socket.js
// Real-time: Location, Ride Matching, SOS, Route Deviation + Guardian Alerts

const User = require('../models/User');
const Ride = require('../models/Ride');
const { isDeviated } = require('../utils/routeDeviation');

const connectedUsers = {};  // { userId: socketId }

// ── Guardian Notification Helper ─────────────────────────────────────────
// In production: call Twilio SMS / WhatsApp API here
const notifyGuardians = (guardianContacts, event, data) => {
  const active = (guardianContacts || []).filter(c => c.isActive);
  if (active.length === 0) return;

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

const initSocket = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ── USER JOINS ─────────────────────────────────────────────────────────
    socket.on('user:join', async ({ userId }) => {
      if (!userId) return;
      connectedUsers[userId] = socket.id;
      socket.userId = userId;
      socket.join(userId);
      console.log(`👩 User joined: ${userId}`);
    });

    // ── DRIVER LOCATION — every 5s, with route deviation + guardian alert ──
    socket.on('driver:location', async ({ driverId, coordinates, rideId }) => {
      try {
        await User.findByIdAndUpdate(driverId, {
          location: { type: 'Point', coordinates },
        });

        if (rideId) {
          const ride = await Ride.findById(rideId)
            .populate('passenger', 'name guardianContacts')
            .select('passenger pickupLocation dropoffLocation status routeCoordinates routeDeviated');

          if (ride) {
            // Send live location to passenger
            io.to(ride.passenger._id.toString()).emit('driver:location:update', {
              coordinates,
              timestamp: new Date(),
            });

            // ── Route Deviation Monitoring + Guardian Alert ────────────────
            if (ride.status === 'in_progress') {
              const deviated = isDeviated(
                coordinates,
                ride.pickupLocation.coordinates,
                ride.dropoffLocation.coordinates,
                0.5
              );

              if (deviated) {
                // Alert passenger
                io.to(ride.passenger._id.toString()).emit('ride:route-deviation', {
                  message: '⚠️ Driver has deviated from the planned route! Tap SOS if you feel unsafe.',
                  coordinates,
                });

                if (!ride.routeDeviated) {
                  await Ride.findByIdAndUpdate(rideId, { routeDeviated: true });

                  // ── Alert guardian contacts about route deviation ──────────
                  const notified = notifyGuardians(
                    ride.passenger.guardianContacts,
                    'route_deviation',
                    { passengerName: ride.passenger.name, coordinates }
                  );

                  if (notified && notified.length > 0) {
                    io.to(ride.passenger._id.toString()).emit('guardian:notified', {
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
            }
          }
        }
      } catch (error) {
        console.error('Location update error:', error.message);
      }
    });

    // ── NEW RIDE REQUEST — notify online verified female drivers ────────────
    socket.on('ride:new-request', async ({ rideId, pickupCoordinates }) => {
      try {
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name averageRating guardianContacts');
        if (!ride) return;

        // ── Guardian: ride booked notification ────────────────────────────
        notifyGuardians(ride.passenger.guardianContacts, 'ride_booked', {
          passengerName: ride.passenger.name,
        });

        const drivers = await User.find({
          role: 'driver', gender: 'female',
          isVerified: true, isOnline: true, isSuspended: false,
        });

        drivers.forEach(driver => {
          const sid = connectedUsers[driver._id.toString()];
          if (sid) {
            io.to(sid).emit('ride:incoming', {
              rideId:          ride._id,
              passengerId:     ride.passenger._id,
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
          }
        });
        console.log(`🚗 Ride ${rideId} broadcast to ${drivers.length} drivers`);
      } catch (err) {
        console.error('Ride request socket error:', err.message);
      }
    });

    // ── DRIVER ACCEPTS — notify passenger + guardian ────────────────────────
    socket.on('ride:accepted', async ({ rideId, driverId, passengerId }) => {
      try {
        const driver = await User.findById(driverId)
          .select('name phone averageRating driverDetails');
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name guardianContacts');

        io.to(passengerId).emit('ride:driver-found', {
          rideId,
          driver: {
            name:         driver.name,
            phone:        driver.phone,
            rating:       driver.averageRating,
            vehicle:      `${driver.driverDetails?.vehicleMake} ${driver.driverDetails?.vehicleModel}`,
            vehicleColor: driver.driverDetails?.vehicleColor,
            licensePlate: driver.driverDetails?.licensePlate,
          },
          eta: '4 min',
        });

        // ── Guardian: driver assigned notification ─────────────────────────
        if (ride?.passenger) {
          notifyGuardians(ride.passenger.guardianContacts, 'driver_assigned', {
            passengerName: ride.passenger.name,
            driverName:    driver.name,
            licensePlate:  driver.driverDetails?.licensePlate || 'N/A',
          });
        }
      } catch (err) {
        console.error('Ride accepted socket error:', err.message);
      }
    });

    // ── DRIVER ARRIVED ──────────────────────────────────────────────────────
    socket.on('ride:driver-arrived', ({ passengerId }) => {
      io.to(passengerId).emit('ride:driver-at-pickup', {
        message: 'Your driver has arrived! Please come out 🌸',
      });
    });

    // ── OTP VERIFIED — ride officially starts + guardian notification ───────
    socket.on('ride:otp-verified', async ({ passengerId, rideId }) => {
      try {
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name guardianContacts')
          .populate('driver', 'name phone driverDetails');

        io.to(passengerId).emit('ride:started', {
          rideId,
          message: 'Your ride has started! Enjoy the journey 🚗',
          startTime: new Date(),
        });

        // ── Guardian: ride started notification ──────────────────────────
        if (ride?.passenger) {
          const notified = notifyGuardians(ride.passenger.guardianContacts, 'ride_started', {
            passengerName: ride.passenger.name,
            driverName:    ride.driver?.name || 'Driver',
            vehicle:       `${ride.driver?.driverDetails?.vehicleMake || ''} ${ride.driver?.driverDetails?.vehicleModel || ''}`.trim(),
            licensePlate:  ride.driver?.driverDetails?.licensePlate || 'N/A',
            pickup:        ride.pickupLocation?.address || '',
          });

          if (notified && notified.length > 0) {
            io.to(passengerId).emit('guardian:notified', {
              event:   'ride_started',
              message: `🛡️ ${notified.length} guardian contact(s) notified your ride has started.`,
              contacts: notified,
            });
          }
        }
      } catch (err) {
        console.error('OTP verified socket error:', err.message);
      }
    });

    // ── RIDE COMPLETE + guardian notification ───────────────────────────────
    socket.on('ride:completed', async ({ passengerId, rideId, fare }) => {
      try {
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name guardianContacts');

        io.to(passengerId).emit('ride:finished', {
          rideId, fare,
          message: 'You have arrived safely! 🌸 Please rate your driver.',
        });

        // ── Guardian: ride completed notification ─────────────────────────
        if (ride?.passenger) {
          notifyGuardians(ride.passenger.guardianContacts, 'ride_completed', {
            passengerName: ride.passenger.name,
            dropoff:       ride.dropoffLocation?.address || 'destination',
            fare:          fare || 0,
          });
        }
      } catch (err) {
        console.error('Ride completed socket error:', err.message);
      }
    });

    // ── SOS EMERGENCY + guardian + admin ───────────────────────────────────
    socket.on('sos:activated', async ({ rideId, passengerId, coordinates }) => {
      try {
        const ride = await Ride.findById(rideId)
          .populate('passenger', 'name phone guardianContacts')
          .populate('driver', 'name phone driverDetails');
        if (!ride) return;

        ride.sosActivated = true;
        await ride.save();

        // ── Notify guardian contacts IMMEDIATELY ──────────────────────────
        notifyGuardians(ride.passenger.guardianContacts, 'sos_alert', {
          passengerName: ride.passenger.name,
          driverName:    ride.driver?.name || 'Driver',
          licensePlate:  ride.driver?.driverDetails?.licensePlate || 'N/A',
          coordinates,
        });

        // Broadcast to admin dashboard
        io.emit('admin:sos-alert', {
          rideId, passenger: ride.passenger.name,
          passengerPhone: ride.passenger.phone,
          driver: ride.driver?.name,
          driverPhone: ride.driver?.phone,
          licensePlate: ride.driver?.driverDetails?.licensePlate,
          coordinates, timestamp: new Date(),
        });

        io.to(passengerId || ride.passenger._id.toString()).emit('sos:confirmed', {
          message: '🆘 SOS sent! Emergency contacts & Police 15 have been alerted.',
          guardianCount: (ride.passenger.guardianContacts || []).filter(c => c.isActive).length,
        });
      } catch (err) {
        console.error('SOS socket error:', err.message);
      }
    });

    // ── OTP FAILURE ALERT (fake ride detection) ────────────────────────────
    socket.on('ride:otp-failed', async ({ rideId, passengerId, failureCount }) => {
      try {
        if (failureCount >= 2) {
          io.to(passengerId).emit('ride:otp-warning', {
            message: `⚠️ Driver has entered the wrong OTP ${failureCount} time(s). If you feel unsafe, use SOS.`,
            failureCount,
          });
        }
        if (failureCount >= 3) {
          // Ride auto-cancelled — notify passenger
          io.to(passengerId).emit('ride:fake-ride-alert', {
            message: '🚨 Ride cancelled: Driver failed OTP verification 3 times. Incident reported to safety team.',
          });

          // Alert admin
          io.emit('admin:fake-ride-alert', { rideId, failureCount, timestamp: new Date() });
        }
      } catch (err) {
        console.error('OTP failure socket error:', err.message);
      }
    });

    // ── DRIVER ONLINE/OFFLINE ──────────────────────────────────────────────
    socket.on('driver:toggle-online', async ({ driverId, isOnline }) => {
      try {
        await User.findByIdAndUpdate(driverId, { isOnline });
        socket.emit('driver:status-updated', { isOnline });
        console.log(`Driver ${driverId} → ${isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}`);
      } catch (err) {
        console.error('Driver status error:', err.message);
      }
    });

    // ── DISCONNECT ─────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      if (socket.userId) {
        delete connectedUsers[socket.userId];
        await User.findByIdAndUpdate(socket.userId, { isOnline: false }).catch(() => {});
        console.log(`❌ Disconnected: ${socket.userId}`);
      }
    });
  });
};

module.exports = initSocket;
