// ─────────────────────────────────────────
//  controllers/authController.js
//  Handles: Phone OTP, CNIC check, Signup (with CNIC photos), Login, Profile
// ─────────────────────────────────────────

const crypto   = require("crypto");
const mongoose = require("mongoose");
const jwt      = require("jsonwebtoken");
const User     = require("../models/User");
const PhoneOtp = require("../models/PhoneOtp");
const config   = require("../config/appConfig");
const storage  = require("../services/storage");
const { getSmsProvider } = require("../services/sms");
const { checkCNIC, normalizePhone, checkPassword, isEmail } = require("../utils/validation");

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const minutesFromNow = (m) => new Date(Date.now() + m * 60 * 1000);

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
      totalRatings:  user.totalRatings,
      totalRides:    user.totalRides,
      profilePhoto:  user.profilePhoto,
      guardianContacts: user.guardianContacts,
    },
  });
};

// ════════════════════════════════════════
//  @route  POST /api/auth/verify-cnic
//  @desc   Check CNIC format + female eligibility (instant feedback during signup;
//          the same check is enforced again inside signup)
//  @access Public
// ════════════════════════════════════════
exports.verifyCNIC = async (req, res) => {
  const result = checkCNIC(req.body.cnic);
  if (!result.valid || !result.eligible) {
    return res.status(400).json({
      success: false,
      cnicVerified: false,
      eligible: false,
      reason: result.valid ? "not_eligible" : "invalid_format",
      message: result.reason,
    });
  }
  if (await User.exists({ cnic: result.formatted })) {
    return res.status(400).json({ success: false, cnicVerified: false, reason: "already_registered", message: "This CNIC is already registered." });
  }
  res.status(200).json({
    success: true,
    cnicVerified: true,
    eligible: true,
    cnic: result.formatted,
    message: "CNIC format is valid and eligible for registration.",
  });
};

// ════════════════════════════════════════
//  @route  POST /api/auth/send-otp
//  @desc   Send a 6-digit code to a Pakistani mobile number
//  @access Public
// ════════════════════════════════════════
exports.sendPhoneOTP = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) {
      return res.status(400).json({ success: false, message: "Enter a valid Pakistani mobile number, e.g. 03001234567." });
    }
    if (await User.exists({ phone })) {
      return res.status(400).json({ success: false, message: "An account with this phone number already exists. Please sign in." });
    }

    const existing = await PhoneOtp.findOne({ phone });
    if (existing) {
      const waitSeconds = Math.ceil((existing.lastSentAt.getTime() + config.otp.resendCooldownSeconds * 1000 - Date.now()) / 1000);
      if (waitSeconds > 0) {
        return res.status(429).json({ success: false, message: `Please wait ${waitSeconds}s before requesting a new code.`, retryAfterSeconds: waitSeconds });
      }
    }

    const provider = getSmsProvider();
    if (!provider.isReal && !config.DEMO_MODE) {
      return res.status(503).json({ success: false, message: "SMS service is not configured. Contact support." });
    }

    // Demo provider uses the configured demo code; a real provider gets a random code
    const code = provider.isReal
      ? crypto.randomInt(0, 10 ** config.otp.length).toString().padStart(config.otp.length, "0")
      : config.otp.demoCode;

    await PhoneOtp.findOneAndUpdate(
      { phone },
      {
        phone,
        codeHash: sha256(`${phone}:${code}`),
        expiresAt: minutesFromNow(config.otp.expiresMinutes),
        attempts: 0,
        lastSentAt: new Date(),
        verified: false,
        verificationTokenHash: null,
        tokenExpiresAt: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      await provider.sendOtp(phone, code);
    } catch (err) {
      console.error("SMS send error:", err.message);
      return res.status(502).json({ success: false, message: "Could not send the SMS. Please try again." });
    }

    res.status(200).json({
      success: true,
      phone,
      expiresInSeconds: config.otp.expiresMinutes * 60,
      resendInSeconds:  config.otp.resendCooldownSeconds,
      demo: !provider.isReal,
      ...(provider.isReal
        ? { message: `A verification code was sent by SMS to ${phone}.` }
        : { message: "Demo mode: no SMS was sent. Use the demo code shown.", demoOtp: code }),
    });
  } catch (error) {
    console.error("Send OTP error:", error.message);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/auth/verify-phone-otp
//  @desc   Check the code → returns a short-lived phoneVerificationToken for signup
//  @access Public
// ════════════════════════════════════════
exports.verifyPhoneOTP = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const otp   = String(req.body.otp ?? "").trim();
    if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone number and code are required." });

    const record = await PhoneOtp.findOne({ phone });
    if (!record) return res.status(400).json({ success: false, message: "No code was requested for this number. Tap Send OTP." });
    if (record.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: "This code has expired. Request a new one.", expired: true });
    }
    if (record.attempts >= config.otp.maxAttempts) {
      return res.status(429).json({ success: false, message: "Too many incorrect attempts. Request a new code.", locked: true });
    }

    if (record.codeHash !== sha256(`${phone}:${otp}`)) {
      record.attempts += 1;
      await record.save();
      const left = config.otp.maxAttempts - record.attempts;
      return res.status(400).json({
        success: false,
        message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect attempts. Request a new code.",
        attemptsLeft: left,
      });
    }

    const token = crypto.randomBytes(24).toString("hex");
    record.verified = true;
    record.verificationTokenHash = sha256(token);
    record.tokenExpiresAt = minutesFromNow(config.otp.verificationTokenMinutes);
    await record.save();

    res.status(200).json({
      success: true,
      message: "✅ Phone verified successfully",
      phone,
      phoneVerified: true,
      phoneVerificationToken: token,
      tokenExpiresInSeconds: config.otp.verificationTokenMinutes * 60,
    });
  } catch (error) {
    console.error("Verify OTP error:", error.message);
    res.status(500).json({ success: false, message: "OTP verification error" });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/auth/signup   (multipart/form-data)
//  @desc   Register with verified phone, eligible CNIC and CNIC front/back photos
//  @access Public
// ════════════════════════════════════════
exports.signup = async (req, res) => {
  const savedKeys = [];
  try {
    const { name, email, password, role, cnic, phoneVerificationToken,
            licenseNumber, vehicleMake, vehicleModel,
            vehicleYear, vehicleColor, licensePlate } = req.body;
    const bad = (message, extra = {}) => res.status(400).json({ success: false, message, ...extra });

    // ── Basic fields ─────────────────────
    if (!name || String(name).trim().length < 2) return bad("Please enter your full name.");
    if (!isEmail(email))                          return bad("Please enter a valid email address.");
    if (!["passenger", "driver"].includes(role))  return bad("Role must be passenger or driver.");
    const passwordError = checkPassword(password);
    if (passwordError)                            return bad(passwordError);

    // ── CNIC: format + female eligibility (server-side, cannot be bypassed) ──
    const cnicCheck = checkCNIC(cnic);
    if (!cnicCheck.valid)    return bad(cnicCheck.reason, { cnicVerified: false });
    if (!cnicCheck.eligible) return bad(cnicCheck.reason, { cnicVerified: false, reason: "not_eligible" });

    // ── Phone must have been verified by OTP ──
    const phone = normalizePhone(req.body.phone);
    if (!phone) return bad("Enter a valid Pakistani mobile number.");
    const otpRecord = phoneVerificationToken && await PhoneOtp.findOne({
      phone,
      verified: true,
      verificationTokenHash: sha256(phoneVerificationToken),
      tokenExpiresAt: { $gt: new Date() },
    });
    if (!otpRecord) return bad("Phone number is not verified (or verification expired). Please verify it with OTP again.", { phoneVerified: false });

    // ── CNIC photos ──────────────────────
    const front = req.files?.cnicFront?.[0];
    const back  = req.files?.cnicBack?.[0];
    if (!front || !back) return bad("Please upload both the front and back photos of your CNIC.");

    // ── Uniqueness ───────────────────────
    const emailLower = String(email).trim().toLowerCase();
    if (await User.exists({ cnic: cnicCheck.formatted })) return bad("This CNIC is already registered.");
    if (await User.exists({ email: emailLower }))         return bad("An account with this email already exists.");
    if (await User.exists({ phone }))                     return bad("An account with this phone number already exists.");

    // ── Save CNIC photos privately, then create the user ──
    const userId = new mongoose.Types.ObjectId();
    const extOf = (f) => ({ "image/png": ".png", "image/webp": ".webp" }[f.mimetype] || ".jpg");
    const frontKey = await storage.save(`cnic/${userId}/front${extOf(front)}`, front.buffer); savedKeys.push(frontKey);
    const backKey  = await storage.save(`cnic/${userId}/back${extOf(back)}`,  back.buffer);  savedKeys.push(backKey);

    const userData = {
      _id: userId,
      name: String(name).trim(), email: emailLower, phone, password, role,
      cnic: cnicCheck.formatted,
      gender: "female",                 // decided by the CNIC rule above, never by the client
      cnicVerified: true,
      cnicVerificationStatus: "verified",
      cnicVerificationNote: "Format and female eligibility checked at signup (NADRA check not integrated)",
      cnicImages: { front: frontKey, back: backKey, uploadedAt: new Date() },
      phoneVerifiedAt: new Date(),
      isVerified: role === "passenger",  // drivers wait for admin approval
    };

    if (role === "driver") {
      userData.driverDetails = {
        cnicNumber:      cnicCheck.formatted,
        licenseNumber:   licenseNumber  || "",
        vehicleMake:     vehicleMake    || "",
        vehicleModel:    vehicleModel   || "",
        vehicleYear:     vehicleYear    || "",
        vehicleColor:    vehicleColor   || "",
        licensePlate:    licensePlate   || "",
        backgroundCheck: "pending",
        backgroundNotes: "",
      };
    }

    const user = await User.create(userData);
    await PhoneOtp.deleteOne({ _id: otpRecord._id }); // token is single-use
    sendTokenResponse(user, 201, res);

  } catch (error) {
    // Don't leave orphaned CNIC photos behind if the account was not created
    await Promise.all(savedKeys.map(k => storage.remove(k).catch(() => {})));
    console.error("Signup error:", error.message);
    res.status(500).json({ success: false, message: "Server error during signup. Please try again." });
  }
};

// ════════════════════════════════════════
//  @route  POST /api/auth/login   (email or phone)
// ════════════════════════════════════════
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email/phone and password" });
    }

    // Accept login by email OR phone number (any common Pakistani format)
    const identifier = String(email).trim();
    const query = identifier.includes("@")
      ? { email: identifier.toLowerCase() }
      : { phone: normalizePhone(identifier) || identifier };
    const user = await User.findOne(query).select("+password");
    if (!user) return res.status(401).json({ success: false, message: "Invalid email/phone or password." });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Invalid email/phone or password." });

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

    // Only update the fields that were sent
    const updates = {};
    if (name !== undefined)  updates.name = name;
    if (phone !== undefined) {
      const normalized = normalizePhone(phone);
      if (!normalized) return res.status(400).json({ success: false, message: "Enter a valid Pakistani mobile number." });
      const taken = await User.exists({ phone: normalized, _id: { $ne: req.user.id } });
      if (taken) return res.status(400).json({ success: false, message: "This phone number is already in use" });
      updates.phone = normalized;
    }
    if (guardianContacts !== undefined) {
      if (!Array.isArray(guardianContacts)) {
        return res.status(400).json({ success: false, message: "guardianContacts must be a list" });
      }
      updates.guardianContacts = guardianContacts.map(c => ({
        name: c.name, phone: c.phone, isActive: c.isActive === true,
      }));
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
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
    const passwordError = checkPassword(newPassword);
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });

    const user = await User.findById(req.user.id).select("+password");
    const isMatch = await user.matchPassword(currentPassword || "");
    if (!isMatch) return res.status(400).json({ success: false, message: "Current password is incorrect" });
    user.password = newPassword;
    await user.save();
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
