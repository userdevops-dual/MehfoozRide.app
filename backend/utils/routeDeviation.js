// utils/routeDeviation.js — checks if driver GPS deviates from planned route
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const isDeviated = (current, pickup, dropoff, threshold = 0.5) => {
  const [cLng, cLat] = current;
  const [pLng, pLat] = pickup;
  const [dLng, dLat] = dropoff;
  const d13 = haversine(pLat, pLng, cLat, cLng);
  const b13 = Math.atan2(Math.sin((cLng-pLng)*Math.PI/180)*Math.cos(cLat*Math.PI/180), Math.cos(pLat*Math.PI/180)*Math.sin(cLat*Math.PI/180)-Math.sin(pLat*Math.PI/180)*Math.cos(cLat*Math.PI/180)*Math.cos((cLng-pLng)*Math.PI/180));
  const b12 = Math.atan2(Math.sin((dLng-pLng)*Math.PI/180)*Math.cos(dLat*Math.PI/180), Math.cos(pLat*Math.PI/180)*Math.sin(dLat*Math.PI/180)-Math.sin(pLat*Math.PI/180)*Math.cos(dLat*Math.PI/180)*Math.cos((dLng-pLng)*Math.PI/180));
  const xTrack = Math.asin(Math.sin(d13/6371)*Math.sin(b13-b12))*6371;
  return Math.abs(xTrack) > threshold;
};
module.exports = { isDeviated, haversine };
