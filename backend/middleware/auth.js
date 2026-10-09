// ─────────────────────────────────────────
//  middleware/auth.js
//  Protects routes — checks JWT token
// ─────────────────────────────────────────

const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ── Protect Route ─────────────────────────
// Add this to any route that needs login
const protect = async (req, res, next) => {
  let token;

  // Check Authorization header: "Bearer TOKEN"
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Please log in first.",
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from DB (excluding password)
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User not found. Please log in again.",
      });
    }

    if (req.user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Contact support.",
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid token. Please log in again.",
    });
  }
};

// ── Restrict to specific roles ────────────
// Usage: authorize("driver") or authorize("passenger")
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not allowed to access this route`,
      });
    }
    next();
  };
};

// ── Verified drivers only ─────────────────
const verifiedDriver = (req, res, next) => {
  if (req.user.role !== "driver") {
    return res.status(403).json({
      success: false,
      message: "Only drivers can access this route",
    });
  }

  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      message:
        "Your driver account is pending verification. Please wait 24-48 hours.",
    });
  }

  next();
};

module.exports = { protect, authorize, verifiedDriver };
