// utils/geoValidation.js — coordinate checks shared by routes and controllers

// Service area: Pakistan (rough bounding box)
const SERVICE_AREA = { minLat: 23.5, maxLat: 37.5, minLng: 60.5, maxLng: 78.0 };

const inServiceArea = ({ lat, lng }) =>
  lat >= SERVICE_AREA.minLat && lat <= SERVICE_AREA.maxLat &&
  lng >= SERVICE_AREA.minLng && lng <= SERVICE_AREA.maxLng;

// "31.52", "74.35" → { lat, lng } or null
const parsePoint = (lat, lng) => {
  const p = { lat: Number(lat), lng: Number(lng) };
  if (lat === undefined || lng === undefined || lat === "" || lng === "") return null;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
  return p;
};

// [lng, lat] array (GeoJSON order, as stored on rides) → { lat, lng } or null
const fromLngLat = (c) =>
  Array.isArray(c) && c.length === 2 ? parsePoint(c[1], c[0]) : null;

module.exports = { parsePoint, fromLngLat, inServiceArea, SERVICE_AREA };
