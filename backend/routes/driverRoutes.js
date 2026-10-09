const express = require('express');
const router  = express.Router();
const { uploadDocuments, toggleOnlineStatus, getDriverStats } = require('../controllers/driverController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('driver'));

router.put('/upload-docs',   uploadDocuments);
router.put('/toggle-online', toggleOnlineStatus);
router.put('/online',        toggleOnlineStatus);   // alias used by frontend
router.get('/stats',         getDriverStats);

module.exports = router;
