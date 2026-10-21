// routes/geoRoutes.js — map services for the app (logged-in users only)
//   GET /api/geo/search?q=gulberg&lat=..&lng=..
//   GET /api/geo/reverse?lat=..&lng=..
//   GET /api/geo/route?fromLat=..&fromLng=..&toLat=..&toLng=..
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const geo = require('../services/geo');
const { parsePoint } = require('../utils/geoValidation');

router.use(protect);

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('Geo error:', e.message);
    res.status(status).json({ success: false, message: e.status ? e.message : 'Map service error' });
  }
};

router.get('/search', handle(async (req, res) => {
  const near = parsePoint(req.query.lat, req.query.lng);
  const places = await geo.search(req.query.q, near || undefined);
  res.json({ success: true, count: places.length, places });
}));

router.get('/reverse', handle(async (req, res) => {
  const p = parsePoint(req.query.lat, req.query.lng);
  if (!p) return res.status(400).json({ success: false, message: 'Valid lat and lng are required' });
  res.json({ success: true, place: await geo.reverse(p.lat, p.lng) });
}));

router.get('/route', handle(async (req, res) => {
  const from = parsePoint(req.query.fromLat, req.query.fromLng);
  const to   = parsePoint(req.query.toLat,   req.query.toLng);
  if (!from || !to) return res.status(400).json({ success: false, message: 'Valid pickup and destination coordinates are required' });
  res.json({ success: true, routes: await geo.routes(from, to) });
}));

module.exports = router;
