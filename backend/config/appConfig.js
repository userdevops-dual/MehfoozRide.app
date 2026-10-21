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

  uploads: {
    // STORAGE_DRIVER=local (default) — files kept privately under backend/uploads/private
    driver:            (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    maxImageBytes:     5 * 1024 * 1024,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
};
