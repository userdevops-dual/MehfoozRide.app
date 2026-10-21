const express = require('express');
const router  = express.Router();
const {
  signup, login, getMe, updateProfile, changePassword,
  verifyCNIC, sendPhoneOTP, verifyPhoneOTP,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { uploadCnicImages } = require('../middleware/upload');

router.post('/signup',              uploadCnicImages, signup);   // multipart: fields + cnicFront + cnicBack
router.post('/login',               login);
router.post('/verify-cnic',         verifyCNIC);          // CNIC verification
router.post('/send-otp',            sendPhoneOTP);        // Phone OTP (NEW)
router.post('/verify-phone-otp',    verifyPhoneOTP);      // OTP verification (NEW)
router.get('/me',                   protect, getMe);
router.put('/update-profile',       protect, updateProfile);
router.put('/change-password',      protect, changePassword);

module.exports = router;
