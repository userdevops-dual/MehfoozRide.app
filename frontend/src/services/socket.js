// frontend/src/services/socket.js
import { io } from 'socket.io-client';
import { BACKEND_URL } from './api';

let socket = null;

export const connectSocket = (userId) => {
  if (socket?.connected) return socket;

  socket = io(BACKEND_URL, {
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
    if (userId) socket.emit('user:join', { userId });
  });

  socket.on('disconnect', () => console.log('❌ Socket disconnected'));
  socket.on('connect_error', (err) => console.log('Socket error:', err.message));

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) { socket.disconnect(); socket = null; }
};

// ── Emit Helpers ────────────────────────────────────────────────────────────
export const emitNewRideRequest = (rideId, pickupCoordinates) => {
  socket?.emit('ride:new-request', { rideId, pickupCoordinates });
};

export const emitRideAccepted = (rideId, driverId, passengerId) => {
  socket?.emit('ride:accepted', { rideId, driverId, passengerId });
};

export const emitDriverArrived = (passengerId) => {
  socket?.emit('ride:driver-arrived', { passengerId });
};

export const emitOTPVerified = (passengerId, rideId) => {
  socket?.emit('ride:otp-verified', { passengerId, rideId });
};

export const emitOTPFailed = (rideId, passengerId, failureCount) => {
  socket?.emit('ride:otp-failed', { rideId, passengerId, failureCount });
};

export const emitRideCompleted = (passengerId, rideId, fare) => {
  socket?.emit('ride:completed', { passengerId, rideId, fare });
};

export const emitSOS = (rideId, passengerId, coordinates) => {
  socket?.emit('sos:activated', { rideId, passengerId, coordinates });
};

export const emitDriverLocation = (driverId, coordinates, rideId) => {
  socket?.emit('driver:location', { driverId, coordinates, rideId });
};

export const emitDriverOnline = (driverId, isOnline) => {
  socket?.emit('driver:toggle-online', { driverId, isOnline });
};

// ── Listen Helpers ───────────────────────────────────────────────────────────
export const onDriverLocation = (callback) => {
  socket?.on('driver:location:update', callback);
};

export const onRouteDeviation = (callback) => {
  socket?.on('ride:route-deviation', callback);
};

export const onGuardianNotified = (callback) => {
  socket?.on('guardian:notified', callback);
};

export const onOTPWarning = (callback) => {
  socket?.on('ride:otp-warning', callback);
};

export const onFakeRideAlert = (callback) => {
  socket?.on('ride:fake-ride-alert', callback);
};

export const offEvent = (event) => {
  socket?.off(event);
};
