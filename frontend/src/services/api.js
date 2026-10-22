// frontend/src/services/api.js
import axios from 'axios';

export const BACKEND_URL = 'http://10.0.2.2:5000';  // Android emulator; use your IP for device

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 10000,
});

// Current JWT — set by AuthContext on login / signup / session restore
let authToken = null;
export const setAuthToken = (token) => { authToken = token; };
export const getAuthToken = () => authToken;

// Add auth token to every request
api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

export default api;

// ── Auth API ──────────────────────────────────────────────────────────────
// Image picked with expo-image-picker → multipart file part
const toFilePart = (img, name) => ({
  uri:  img.uri,
  name: img.fileName || `${name}.${(img.mimeType || 'image/jpeg').split('/')[1]}`,
  type: img.mimeType || 'image/jpeg',
});

export const authAPI = {
  // fields: name, email, phone, password, role, cnic, phoneVerificationToken, driver fields
  // images: { front, back } — CNIC photos from expo-image-picker
  signup: (fields, images) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, String(v)); });
    fd.append('cnicFront', toFilePart(images.front, 'cnic-front'));
    fd.append('cnicBack',  toFilePart(images.back,  'cnic-back'));
    return api.post('/auth/signup', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }).then(r => r.data);
  },
  sendOTP:       (phone)      => api.post('/auth/send-otp', { phone }).then(r => r.data),
  verifyOTP:     (phone, otp) => api.post('/auth/verify-phone-otp', { phone, otp }).then(r => r.data),
  login:         (data)   => api.post('/auth/login',  data).then(r => r.data),
  getMe:         ()       => api.get('/auth/me').then(r => r.data),
  updateProfile: (data)   => api.put('/auth/update-profile', data).then(r => r.data),
  changePassword:(currentPassword, newPassword) =>
    api.put('/auth/change-password', { currentPassword, newPassword }).then(r => r.data),
  // NEW: CNIC verification
  verifyCNIC:    (cnic)   => api.post('/auth/verify-cnic', { cnic }).then(r => r.data),
};

// ── Ride API ──────────────────────────────────────────────────────────────
export const rideAPI = {
  // { pickupCoordinates, dropoffCoordinates ([lng, lat]), rideType, isPooled } → real routes + fares
  estimate:  (data)       => api.post('/rides/estimate', data, { timeout: 30000 }).then(r => r.data),
  book:      (data)       => api.post('/rides', data, { timeout: 30000 }).then(r => r.data),
  accept:    (rideId)     => api.put(`/rides/${rideId}/accept`).then(r => r.data),
  decline:   (rideId)     => api.put(`/rides/${rideId}/decline`).then(r => r.data),
  arrived:   (rideId)     => api.put(`/rides/${rideId}/arrived`).then(r => r.data),
  verifyOTP: (rideId, otp)=> api.post(`/rides/${rideId}/verify-otp`, { otp }).then(r => r.data),
  complete:  (rideId)     => api.put(`/rides/${rideId}/complete`).then(r => r.data),
  cancel:    (rideId, reason) => api.put(`/rides/${rideId}/cancel`, { reason }).then(r => r.data),
  rate:      (rideId, data)   => api.post(`/rides/${rideId}/rate`, data).then(r => r.data),
  sos:       (rideId)     => api.post(`/rides/${rideId}/sos`).then(r => r.data),
  getById:   (rideId)     => api.get(`/rides/${rideId}`).then(r => r.data),
  getMyRides:(as)         => api.get('/rides/my-rides', { params: as ? { as } : {} }).then(r => r.data),
  // NEW: real-time fare update
  getLiveFare:(rideId, distanceKm) => api.get(`/rides/${rideId}/live-fare`, { params: { distanceKm } }).then(r => r.data),
};

// ── Driver API ───────────────────────────────────────────────────────────
export const driverAPI = {
  getStats:  ()           => api.get('/driver/stats').then(r => r.data),
  setOnline: (isOnline)   => api.put('/driver/online', { isOnline }).then(r => r.data),
};


// ── Maps (served by our backend — OpenStreetMap Nominatim + OSRM by default) ──
export const geoAPI = {
  // near: { latitude, longitude } — results are biased towards it
  search:  (q, near) => api.get('/geo/search', {
    params: { q, ...(near ? { lat: near.latitude, lng: near.longitude } : {}) }, timeout: 20000,
  }).then(r => r.data),
  reverse: ({ latitude, longitude }) =>
    api.get('/geo/reverse', { params: { lat: latitude, lng: longitude }, timeout: 20000 }).then(r => r.data),
};
