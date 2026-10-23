// ─────────────────────────────────────────
//  config/appConfig.js
//  Central settings. Values come from backend/.env where noted.
// ─────────────────────────────────────────

const flag = (value, fallback) =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

module.exports = {
  // DEMO_MODE=true → external services (SMS, police dispatch, payments) are simulated
  // and every simulated response says so. Set DEMO_MODE=false in production.
  DEMO_MODE: flag(process.env.DEMO_MODE, true),

  otp: {
    length:                 6,
    expiresMinutes:         5,
    maxAttempts:            5,
    resendCooldownSeconds:  30,
    verificationTokenMinutes: 30,          // time to finish signup after verifying the phone
    demoCode: process.env.DEMO_OTP || '123456', // only used when the SMS provider is "demo"
  },

  // SMS_PROVIDER=demo (default, nothing is sent) | twilio (needs TWILIO_* variables)
  sms: { provider: (process.env.SMS_PROVIDER || 'demo').toLowerCase() },

  password: { minLength: 8 },

  // Driver matching
  matching: {
    searchRadiusKm:          5,     // offer rides to drivers within this distance of the pickup
    maxDriversNotified:      5,     // nearest N eligible drivers get the request
    requestTimeoutSeconds:   120,   // unaccepted requests are cancelled after this
    driverLocationMaxAgeSec: 180,   // drivers whose GPS is older than this are skipped
    sweepIntervalSeconds:    15,    // how often expired requests are cleaned up
  },

  // DEMO_MODE=true (default): services that need paid/official infrastructure
  // (SMS to contacts, police dispatch) are simulated through the SAME workflow
  // and data, and every simulated step is labelled "simulated" in the data and UI.
  demoMode: (process.env.DEMO_MODE || 'true').toLowerCase() !== 'false',

  // Emergency / SOS (services/emergency.js, services/notifier.js)
  emergency: {
    // "demo" logs messages on the server; "twilio" sends real SMS (needs TWILIO_* env vars)
    notifyProvider:   (process.env.NOTIFY_PROVIDER || 'demo').toLowerCase(),
    // No official police API is integrated. When one exists, set POLICE_API_URL
    // and the incident payload is POSTed there; until then dispatch is "not_integrated".
    policeApiUrl:     process.env.POLICE_API_URL || '',
    policeNumber:     '15',
    // Base URL guardians use to open the live-location page (must be reachable from their phones)
    publicBaseUrl:    process.env.PUBLIC_BASE_URL || '',
    liveLinkHours:    12,     // live-location link stops working after this
    maxLocations:     2000,   // location points kept per session
  },

  // Nearby safe places (police, hospitals, public places) from OpenStreetMap via Overpass
  safePlaces: {
    // Tried in order — public Overpass servers are often busy. OVERPASS_URL (comma-separated) overrides.
    overpassUrls: (process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.kumi.systems/api/interpreter').split(',').map(s => s.trim()).filter(Boolean),
    radiusMeters: 3000,
    maxResults:   25,
    maxPerRide:   5,          // safe points a passenger can mark on one ride
  },

  // Unusual-route detection (services/routeMonitor.js)
  routeMonitor: {
    deviationThresholdMeters:    250,  // further than this from the chosen road route counts as off-route
    straightLineThresholdMeters: 900,  // when only a straight pickup→drop-off line is known
    consecutiveReadings:         3,    // readings in a row (~15 s) before an alert / all-clear
    maxGpsAccuracyMeters:        80,   // fixes less accurate than this are ignored for detection
  },

  // Maps — free OpenStreetMap services by default. Point these at your own
  // Nominatim / OSRM servers (or another compatible provider) for production;
  // the public servers are for light development use only.
  geo: {
    geocoderUrl: process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org',
    routingUrl:  process.env.ROUTING_URL  || 'https://router.project-osrm.org',
    // Nominatim's usage policy requires an identifying User-Agent with contact details
    userAgent: `MehfoozRide/1.0 (Final Year Project${process.env.GEO_CONTACT_EMAIL ? `; ${process.env.GEO_CONTACT_EMAIL}` : ''})`,
    countryCodes: 'pk',
    // Lahore — search results near here are preferred (not required)
    defaultCenter: { lat: 31.5204, lng: 74.3587 },
    maxAlternatives: 3,
    cacheMinutes: 30,
  },

  uploads: {
    // STORAGE_DRIVER=local (default) — files kept privately under backend/uploads/private
    driver:            (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    maxImageBytes:     5 * 1024 * 1024,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
};
