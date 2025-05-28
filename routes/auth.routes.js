const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { upload } = require("../utils/multerConfig");
const { signInOtpLimiter, LoginOtpLimiter } = require("../utils/rateLimiters");

// Signup Route
router.post(
  "/signup",
  upload.single("file"),
  signInOtpLimiter,
  authController.signup
);

// Login with Password Route
router.post("/login-password", authController.loginPassword);

// Request Login OTP Route
router.post("/request-login-otp", LoginOtpLimiter, authController.requestLoginOTP);

// Verify OTP Route (Signup & Login)
router.post("/verify-otp", authController.verifyOTP);

// Forgot Password Request
router.post("/forgot-password", authController.requestPasswordReset);

// Reset Password
router.post("/reset-password", authController.resetPassword);

module.exports = router;