const express = require('express');
const router  = express.Router();
const { uploadDocuments, getDocuments, getDriverPhoto, toggleOnlineStatus, getDriverStats } = require('../controllers/driverController');
const { protect, authorize } = require('../middleware/auth');
const { uploadDriverDocs } = require('../middleware/upload');
const { validId } = require('../middleware/validId');

router.param('id', validId);
router.use(protect);

// Any logged-in user: the driver's profile photo (passengers see who is coming)
router.get('/:id/photo', getDriverPhoto);

router.use(authorize('driver'));

router.get('/documents',     getDocuments);
router.put('/documents',     uploadDriverDocs, uploadDocuments);   // multipart: licensePhoto, registrationPhoto, profilePhoto + text fields
router.put('/toggle-online', toggleOnlineStatus);
router.put('/online',        toggleOnlineStatus);   // alias used by frontend
router.get('/stats',         getDriverStats);

module.exports = router;
