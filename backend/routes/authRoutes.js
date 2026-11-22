const express = require('express');
const router  = express.Router();
const {
  signup, login, getMe, updateProfile, changePassword,
  verifyCNIC, sendPhoneOTP, verifyPhoneOTP,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { uploadCnicImages } = require('../middleware/upload');
const { rateLimit } = require('../middleware/security');

// Brute-force protection (per IP, and per phone / email where given)
const MIN = 60 * 1000;
const loginLimit  = rateLimit({ name: 'login',  windowMs: 15 * MIN, max: 10, skipSuccessful: true, keyFrom: r => (r.body?.email || r.body?.phone || '').toLowerCase(), message: 'Too many login attempts. Please wait 15 minutes and try again.' });
const otpLimit    = rateLimit({ name: 'otp',    windowMs: 15 * MIN, max: 5,  keyFrom: r => r.body?.phone, message: 'Too many OTP requests for this number. Please wait 15 minutes.' });
const verifyLimit = rateLimit({ name: 'verify', windowMs: 15 * MIN, max: 20, skipSuccessful: true, keyFrom: r => r.body?.phone });
const signupLimit = rateLimit({ name: 'signup', windowMs: 60 * MIN, max: 10 });
const cnicLimit   = rateLimit({ name: 'cnic',   windowMs: 15 * MIN, max: 30 });
const passLimit   = rateLimit({ name: 'pass',   windowMs: 15 * MIN, max: 10, skipSuccessful: true });

router.post('/signup',              signupLimit, uploadCnicImages, signup);   // multipart: fields + cnicFront + cnicBack
router.post('/login',               loginLimit, login);
router.post('/verify-cnic',         cnicLimit, verifyCNIC);          // CNIC verification
router.post('/send-otp',            otpLimit, sendPhoneOTP);        // Phone OTP (NEW)
router.post('/verify-phone-otp',    verifyLimit, verifyPhoneOTP);      // OTP verification (NEW)
router.get('/me',                   protect, getMe);
router.put('/update-profile',       protect, updateProfile);
router.put('/change-password',      protect, passLimit, changePassword);

module.exports = router;
