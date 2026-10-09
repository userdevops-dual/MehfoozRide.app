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
export const emitNewRideRequest = (rideId) => {
  socket?.emit('ride:new-request', { rideId });
};

export const emitRideAccepted = (rideId) => {
  socket?.emit('ride:accepted', { rideId });
};

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

export const emitDriverLocation = (coordinates, rideId) => {
  socket?.emit('driver:location', { coordinates, rideId });
};

export const emitDriverOnline = (isOnline) => {
  socket?.emit('driver:toggle-online', { isOnline });
};

// ── Listen Helpers ───────────────────────────────────────────────────────────
export const onEvent = (event, callback) => {
  socket?.on(event, callback);
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

export const offEvent = (event) => {
  socket?.off(event);
};
