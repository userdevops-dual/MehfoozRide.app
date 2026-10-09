// ─────────────────────────────────────────
//  controllers/authController.js
//  Handles: Signup, Login, Profile, CNIC Verification
// ─────────────────────────────────────────

const User = require("../models/User");
const jwt  = require("jsonwebtoken");

// ── Helper: Generate JWT Token ────────────
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
};

// ── Helper: Send token in response ───────
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user._id);
  user.password = undefined;
  res.status(statusCode).json({
    success: true,
    token,
    user: {
      _id:           user._id,
      name:          user.name,
      email:         user.email,
      phone:         user.phone,
      role:          user.role,
      gender:        user.gender,
      isVerified:    user.isVerified,
      cnicVerified:  user.cnicVerified,
      averageRating: user.averageRating,
      profilePhoto:  user.profilePhoto,
      guardianContacts: user.guardianContacts,
    },
  });
};

// ── Helper: Validate CNIC Format (Pakistani: 12345-6789012-3) ──
const isValidCNIC = (cnic) => {
  return /^\d{5}-\d{7}-\d{1}$/.test(cnic);
};

// ── CNIC Simulation: In production this calls NADRA/external API ──
// For FYP demo, we simulate: valid format + 13 digits = verified female
const verifyCNICSimulated = (cnic) => {
  if (!cnic || !isValidCNIC(cnic)) {
    return { verified: false, reason: "Invalid CNIC format. Use: 12345-6789012-3" };
  }
  // ── REAL Pakistani NADRA Gender Rule ──────────────────────────────────────
  // Last digit of Pakistani CNIC encodes gender:
  //   EVEN (0, 2, 4, 6, 8) = FEMALE ✅  allowed
  //   ODD  (1, 3, 5, 7, 9) = MALE   ❌  blocked
  //
  // Female example: 35202-1234567-2  → last digit 2 (even) = FEMALE ✅
  // Male example:   35202-1234567-1  → last digit 1 (odd)  = MALE   ❌
  //
  // In production: also verify CNIC is genuine via NADRA API
  const lastDigit = parseInt(cnic.slice(-1));
  const isFemale  = lastDigit % 2 === 0; // even = female

  if (!isFemale) {
    return {
      verified: false,
      reason: "❌ This CNIC belongs to a male identity (last digit is odd). MehfoozRide is women-only. Only female CNICs accepted (last digit must be even: 0, 2, 4, 6, 8).",
    };
  }
  return {
    verified: true,
    gender: "female",
    message: "✅ CNIC verified as female identity (last digit " + lastDigit + " is even = female)",
  };
};

// ════════════════════════════════════════
//  @route  POST /api/auth/verify-cnic
//  @desc   Simulate CNIC verification (NADRA-style)
//  @access Public
// ════════════════════════════════════════
exports.verifyCNIC = async (req, res) => {
  try {
    const { cnic } = req.body;
    if (!cnic) return res.status(400).json({ success: false, message: "CNIC is required" });

    const result = verifyCNICSimulated(cnic);

    if (!result.verified) {
      return res.status(400).json({
        success: false,
        message: result.reason || "CNIC verification failed",
        cnicVerified: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      cnicVerified: true,
      gender: result.gender,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Verification server error" });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/auth/signup
//  @desc   Register a new user (with CNIC check)
//  @access Public
// ════════════════════════════════════════
exports.signup = async (req, res) => {
  try {
    const { name, email, phone, password, role, cnic,
            licenseNumber, vehicleMake, vehicleModel,
            vehicleYear, vehicleColor, licensePlate } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, phone, password and role",
      });
    }

    if (!["passenger", "driver"].includes(role)) {
      return res.status(400).json({ success: false, message: "Role must be passenger or driver" });
    }

    // ── CNIC validation ──────────────────
    if (!cnic || !isValidCNIC(cnic)) {
      return res.status(400).json({
        success: false,
        message: "Valid CNIC is required. Format: 12345-6789012-3",
      });
    }

    const cnicCheck = verifyCNICSimulated(cnic);
    if (!cnicCheck.verified) {
      return res.status(400).json({
        success: false,
        message: "CNIC verification failed: " + cnicCheck.reason,
        cnicVerified: false,
      });
    }

    // ── Check CNIC not already registered ─
    const existingCNIC = await User.findOne({ cnic });
    if (existingCNIC) {
      return res.status(400).json({ success: false, message: "This CNIC is already registered" });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: "An account with this email already exists" });
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ success: false, message: "An account with this phone number already exists" });
    }

    const userData = {
      name, email, phone, password, role, cnic,
      gender: "female",
      cnicVerified: true,
      isVerified: role === "passenger",
    };

    if (role === "driver") {
      userData.driverDetails = {
        cnicNumber: cnic,
        licenseNumber:    licenseNumber    || "",
        vehicleMake:      vehicleMake      || "",
        vehicleModel:     vehicleModel     || "",
        vehicleYear:      vehicleYear      || "",
        vehicleColor:     vehicleColor     || "",
        licensePlate:     licensePlate     || "",
        backgroundCheck:  "pending",
        backgroundNotes:  "",
      };
    }

    const user = await User.create(userData);
    sendTokenResponse(user, 201, res);

  } catch (error) {
    console.error("Signup error:", error.message);
    res.status(500).json({ success: false, message: "Server error during signup", error: error.message });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/auth/login
// ════════════════════════════════════════
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email and password" });
    }

    // Accept login by email OR phone number
    const user = await User.findOne(
      email.includes('@') ? { email } : { phone: email }
    ).select("+password");
    if (!user) return res.status(401).json({ success: false, message: "Invalid credentials. Check email/phone and password." });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid email or password" });

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Contact support@mehfoozride.com",
        suspendReason: user.suspendReason,
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error during login" });
  }
};

// ════════════════════════════════════════
//  @route  GET /api/auth/me
// ════════════════════════════════════════
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ════════════════════════════════════════
//  @route  PUT /api/auth/update-profile
// ════════════════════════════════════════
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, guardianContacts } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { name, phone, guardianContacts },
      { new: true, runValidators: true }
    );
    res.status(200).json({ success: true, message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  PUT /api/auth/change-password
// ════════════════════════════════════════
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select("+password");
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) return res.status(400).json({ success: false, message: "Current password is incorrect" });
    user.password = newPassword;
    await user.save();
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/auth/send-otp
//  @desc   Send OTP to phone (Twilio in production, demo simulation here)
//  @access Public
// ════════════════════════════════════════
exports.sendPhoneOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });

    // In production: use Twilio Verify API
    // const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    // await client.verify.services(process.env.TWILIO_SERVICE).verifications.create({ to: phone, channel: 'sms' });

    // Demo: generate and log OTP (replace with Twilio in production)
    const demoOTP = '123456';
    console.log(`📱 OTP for ${phone}: ${demoOTP} (Demo — use Twilio in production)`);

    res.status(200).json({
      success: true,
      message: `OTP sent to ${phone}`,
      demo: true,
      demoOTP: '123456', // remove in production
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/auth/verify-phone-otp
//  @desc   Verify phone OTP
//  @access Public
// ════════════════════════════════════════
exports.verifyPhoneOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP required' });

    // In production: use Twilio Verify check
    // const check = await client.verify.services(sid).verificationChecks.create({ to: phone, code: otp });
    // if (check.status !== 'approved') return res.status(400).json({ success: false, message: 'Invalid OTP' });

    // Demo: accept any 6-digit code
    if (otp.length === 6) {
      return res.status(200).json({ success: true, message: '✅ Phone verified successfully', phoneVerified: true });
    }
    res.status(400).json({ success: false, message: 'Invalid OTP. Enter the 6-digit code.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'OTP verification error' });
  }
};
