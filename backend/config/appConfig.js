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
