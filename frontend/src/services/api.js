// frontend/src/services/api.js
import axios from 'axios';

export const BACKEND_URL = 'http://10.0.2.2:5000';  // Android emulator; use your IP for device

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 10000,
});

// Add auth token to every request
api.interceptors.request.use((config) => {
  const token = global.authToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auth API ──────────────────────────────────────────────────────────────
export const authAPI = {
  signup:        (data)   => api.post('/auth/signup', data).then(r => r.data),
  login:         (data)   => api.post('/auth/login',  data).then(r => r.data),
  getMe:         ()       => api.get('/auth/me').then(r => r.data),
  updateProfile: (data)   => api.put('/auth/update-profile', data).then(r => r.data),
  changePassword:(data)   => api.put('/auth/change-password', data).then(r => r.data),
  // NEW: CNIC verification
  verifyCNIC:    (cnic)   => api.post('/auth/verify-cnic', { cnic }).then(r => r.data),
};

// ── Ride API ──────────────────────────────────────────────────────────────
export const rideAPI = {
  book:      (data)       => api.post('/rides',               data).then(r => r.data),
  accept:    (rideId)     => api.put(`/rides/${rideId}/accept`).then(r => r.data),
  arrived:   (rideId)     => api.put(`/rides/${rideId}/arrived`).then(r => r.data),
  verifyOTP: (rideId, otp)=> api.post(`/rides/${rideId}/verify-otp`, { otp }).then(r => r.data),
  complete:  (rideId)     => api.put(`/rides/${rideId}/complete`).then(r => r.data),
  cancel:    (rideId, reason) => api.put(`/rides/${rideId}/cancel`, { reason }).then(r => r.data),
  rate:      (rideId, data)   => api.post(`/rides/${rideId}/rate`, data).then(r => r.data),
  sos:       (rideId)     => api.post(`/rides/${rideId}/sos`).then(r => r.data),
  getById:   (rideId)     => api.get(`/rides/${rideId}`).then(r => r.data),
  getMyRides:()           => api.get('/rides/my-rides').then(r => r.data),
  // NEW: real-time fare update
  getLiveFare:(rideId, distanceKm) => api.get(`/rides/${rideId}/live-fare`, { params: { distanceKm } }).then(r => r.data),
};

// ── Driver API ───────────────────────────────────────────────────────────
export const driverAPI = {
  getStats:  ()           => api.get('/driver/stats').then(r => r.data),
  setOnline: (isOnline)   => api.put('/driver/online', { isOnline }).then(r => r.data),
};

// ── Phone OTP (added for signup verification) ─────────────────────────────
// (appended to existing authAPI object — merge manually if needed)
export const phoneOTPAPI = {
  sendOTP:   (phone) => api.post('/auth/send-otp',         { phone }).then(r => r.data),
  verifyOTP: (phone, otp) => api.post('/auth/verify-phone-otp', { phone, otp }).then(r => r.data),
};
