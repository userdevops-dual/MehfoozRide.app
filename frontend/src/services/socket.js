// frontend/src/services/socket.js
import { io } from 'socket.io-client';
import { BACKEND_URL } from './api';

let socket = null;

// The server identifies the user from the JWT sent in the handshake,
// so no user id is ever sent from the client.
export const connectSocket = (token) => {
  if (socket) socket.disconnect();

  socket = io(BACKEND_URL, {
    transports: ['websocket'],
    auth: { token },
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => console.log('✅ Socket connected:', socket.id));
  socket.on('disconnect', () => console.log('❌ Socket disconnected'));
  socket.on('connect_error', (err) => console.log('Socket error:', err.message));

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) { socket.disconnect(); socket = null; }
};

// ── Emit Helpers ────────────────────────────────────────────────────────────
export const emitDriverArrived = (rideId) => {
  socket?.emit('ride:driver-arrived', { rideId });
};

export const emitOTPVerified = (rideId) => {
  socket?.emit('ride:otp-verified', { rideId });
};

export const emitOTPFailed = (rideId, failureCount) => {
  socket?.emit('ride:otp-failed', { rideId, failureCount });
};

export const emitRideCompleted = (rideId) => {
  socket?.emit('ride:completed', { rideId });
};

export const emitSOS = (rideId, coordinates) => {
  socket?.emit('sos:activated', { rideId, coordinates });
};

// rideIds: the driver's active ride(s) — several when pooled (empty when idle)
export const emitDriverLocation = (coordinates, rideIds = []) => {
  socket?.emit('driver:location', { coordinates, rideIds: [].concat(rideIds || []).filter(Boolean) });
};

export const emitDriverOnline = (isOnline) => {
  socket?.emit('driver:toggle-online', { isOnline });
};

// ── Listen Helpers ───────────────────────────────────────────────────────────
// Returns a function that removes just this listener (other screens keep theirs)
export const onEvent = (event, callback) => {
  socket?.on(event, callback);
  return () => socket?.off(event, callback);
};

export const onIncomingRide     = (callback) => onEvent('ride:incoming', callback);
export const onDriverFound      = (callback) => onEvent('ride:driver-found', callback);
export const onDriverArrived    = (callback) => onEvent('ride:driver-at-pickup', callback);
export const onRideStarted      = (callback) => onEvent('ride:started', callback);
export const onRideFinished     = (callback) => onEvent('ride:finished', callback);
export const onDriverLocation   = (callback) => onEvent('driver:location:update', callback);
export const onRouteDeviation   = (callback) => onEvent('ride:route-deviation', callback);
export const onGuardianNotified = (callback) => onEvent('guardian:notified', callback);
export const onOTPWarning       = (callback) => onEvent('ride:otp-warning', callback);
export const onFakeRideAlert    = (callback) => onEvent('ride:fake-ride-alert', callback);
export const onPoolUpdated      = (callback) => onEvent('ride:pool-updated', callback);
export const onRideExpired      = (callback) => onEvent('ride:expired', callback);
export const onRideCancelled    = (callback) => onEvent('ride:cancelled', callback);
export const onRequestWithdrawn = (callback) => onEvent('ride:request-withdrawn', callback);
export const onDriverStatus     = (callback) => onEvent('driver:status-updated', callback);

// Removes every listener for an event — prefer the function returned by onEvent
export const offEvent = (event) => {
  socket?.off(event);
};
