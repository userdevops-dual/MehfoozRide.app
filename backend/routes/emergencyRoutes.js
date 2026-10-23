// routes/emergencyRoutes.js — SOS sessions
//   POST /api/emergency                 start SOS (or get the active one)     { rideId?, coordinates?, accuracy? }
//   GET  /api/emergency/active          my active session, if any
//   GET  /api/emergency/:id             one of my sessions
//   POST /api/emergency/:id/location    live location update                  { coordinates, accuracy? }
//   PUT  /api/emergency/:id/resolve     "I am safe"                            { note? }
//   GET  /api/emergency/live/:token     PUBLIC live-location page for contacts (?format=json for data)
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const EmergencySession = require('../models/EmergencySession');
const emergency = require('../services/emergency');

const handle = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    if (!e.status) console.error('Emergency error:', e.message);
    res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Server error' });
  }
};
const validId = (id) => /^[a-f0-9]{24}$/i.test(String(id));

// ── Public live page (token in the URL is the only access) ────────────────
router.get('/live/:token', handle(async (req, res) => {
  const s = await EmergencySession.findOne({ shareToken: String(req.params.token) });
  if (!s || s.shareExpiresAt < new Date()) {
    return res.status(404).send('<h2 style="font-family:sans-serif">This live-location link has expired or does not exist.</h2>');
  }
  if (req.query.format === 'json') return res.json({ success: true, live: emergency.publicView(s) });
  res.set('Cache-Control', 'no-store').send(livePage(String(req.params.token)));
}));

router.use(protect);

router.post('/', handle(async (req, res) => {
  const { rideId, coordinates, accuracy } = req.body || {};
  if (rideId && !validId(rideId)) return res.status(400).json({ success: false, message: 'Invalid ride id' });
  const { session, created } = await emergency.start({ userId: req.user.id, rideId, coordinates, accuracy });
  res.status(created ? 201 : 200).json({ success: true, created, session: emergency.view(session) });
}));

router.get('/active', handle(async (req, res) => {
  const s = await EmergencySession.findOne({ raisedBy: req.user.id, status: 'active' });
  res.json({ success: true, session: s ? emergency.view(s) : null });
}));

router.get('/:id', handle(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
  const s = await EmergencySession.findOne({ _id: req.params.id, raisedBy: req.user.id });
  if (!s) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, session: emergency.view(s) });
}));

router.post('/:id/location', handle(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
  const s = await emergency.updateLocation({ userId: req.user.id, sessionId: req.params.id, ...req.body });
  res.json({ success: true, lastLocation: s.lastLocation });
}));

router.put('/:id/resolve', handle(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found' });
  const s = await emergency.resolve({ userId: req.user.id, sessionId: req.params.id, note: req.body?.note });
  res.json({ success: true, session: emergency.view(s) });
}));

// Minimal page: OpenStreetMap + the trail, refreshed every 10 s
const livePage = (token) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mehfooz Ride — Live location</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>body{margin:0;font-family:sans-serif}#m{height:70vh}#i{padding:12px}.sos{color:#b71c1c;font-weight:800}.ok{color:#2e7d32;font-weight:800}.demo{color:#777;font-size:12px}</style>
</head><body><div id="m"></div><div id="i">Loading…</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('m').setView([31.52,74.35],13),mk=null,line=null,fitted=false;
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function load(){fetch(location.pathname+'?format=json',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
 var v=d.live,ll=v.lastLocation;
 if(ll){var p=[ll.coordinates[1],ll.coordinates[0]];if(mk)mk.setLatLng(p);else mk=L.marker(p).addTo(map);
  if(line)map.removeLayer(line);line=L.polyline(v.trail,{color:'#d81b60'}).addTo(map);if(!fitted){map.setView(p,16);fitted=true;}}
 var age=ll?Math.round((Date.now()-new Date(ll.at))/1000):null;
 document.getElementById('i').innerHTML=(v.status==='active'?'<div class="sos">🆘 SOS ACTIVE — '+esc(v.name)+'</div>':'<div class="ok">✅ '+esc(v.name)+' marked herself safe</div>')+
 (ll?'<div>Last location: '+(age<60?age+' s':Math.round(age/60)+' min')+' ago'+(ll.accuracy?' (±'+Math.round(ll.accuracy)+' m)':'')+'</div>':'<div>No location received yet</div>')+
 (v.driver?'<div>Driver: '+esc(v.driver.name)+' · '+esc(v.driver.vehicle)+' '+esc(v.driver.licensePlate)+'</div>':'')+
 (v.destination?'<div>Going to: '+esc(v.destination)+'</div>':'')+
 '<div>If you cannot reach her, call Police 15.</div>'+(v.demo?'<div class="demo">Demo mode</div>':'');
}).catch(function(){document.getElementById('i').innerHTML+='<div class="demo">Connection problem — retrying…</div>'})}
load();setInterval(load,10000);
</script></body></html>`;

module.exports = router;
