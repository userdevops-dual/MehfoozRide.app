// middleware/upload.js — CNIC image upload (front + back) kept in memory,
// then written to private storage by the controller.
const multer = require("multer");
const config = require("../config/appConfig");

const cnicUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxImageBytes, files: 2 },
  fileFilter: (req, file, cb) => {
    if (config.uploads.allowedImageTypes.includes(file.mimetype)) return cb(null, true);
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  },
}).fields([
  { name: "cnicFront", maxCount: 1 },
  { name: "cnicBack",  maxCount: 1 },
]);

// Turn multer errors into clear 400 responses
const uploadCnicImages = (req, res, next) =>
  cnicUpload(req, res, (err) => {
    if (!err) return next();
    const mb = Math.round(config.uploads.maxImageBytes / (1024 * 1024));
    const message =
      err.code === "LIMIT_FILE_SIZE"        ? `Each CNIC image must be smaller than ${mb} MB.` :
      err.code === "LIMIT_UNEXPECTED_FILE"  ? "CNIC images must be JPG, PNG or WebP photos." :
      "Could not read the uploaded images.";
    res.status(400).json({ success: false, message });
  });

module.exports = { uploadCnicImages };
