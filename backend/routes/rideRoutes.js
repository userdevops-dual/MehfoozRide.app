const express = require('express');
const router  = express.Router();
const {
  bookRide, estimateRide, acceptRide, declineRide, driverArrived, verifyOTP,
  completeRide, cancelRide, submitRating,
  getMyRides, getRideById, activateSOS, getLiveFare,
} = require('../controllers/rideController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/estimate',          estimateRide);  // routes + fare before booking
router.post('/',                  bookRide);
router.get('/my-rides',           getMyRides);
router.get('/:id',                getRideById);
router.put('/:id/accept',         acceptRide);
router.put('/:id/decline',        declineRide);
router.put('/:id/arrived',        driverArrived);
router.post('/:id/verify-otp',    verifyOTP);
router.put('/:id/complete',       completeRide);
router.put('/:id/cancel',         cancelRide);
router.post('/:id/rate',          submitRating);
router.post('/:id/sos',           activateSOS);
router.get('/:id/live-fare',      getLiveFare);   // NEW: real-time fare

module.exports = router;
