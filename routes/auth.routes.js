const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { upload } = require("../utils/multerConfig");
//const { signInOtpLimiter, LoginOtpLimiter } = require("../utils/rateLimiters");
const authenticateJWT = require("../middleware/auth.middleware");

// Signup Route
// router.post(
//   "/signup",
//   upload.single("file"),
//   signInOtpLimiter,
//   authController.signup
// );
router.post(
  "/signup",
  (req, res, next) => { // Add a middleware to log headers
    console.log("Incoming Signup Request Headers:", req.headers['content-type']);
    next();
  },
  upload.single("file"),
  //signInOtpLimiter,
  authController.signup
);
// Get Auth Status
router.get("/status", authController.getAuthStatus);
// Resend Signup OTP Route
router.post("/resend-signup-otp", /*signInOtpLimiter,*/ authController.resendSignupOTP);

// Login with Password Route
router.post("/login-password", authController.loginPassword);

// Request Login OTP Route
router.post("/request-login-otp", /*LoginOtpLimiter,*/ authController.requestLoginOTP);

// Verify OTP Route (Signup & Login)
router.post("/verify-otp", authController.verifyOTP);

// Forgot Password Request
router.post("/forgot-password", authController.requestPasswordReset);

// Reset Password
router.post("/reset-password", authController.resetPassword);

// Verify Email Change
router.get("/verify-email", authController.verifyEmail);

// Email Change Verification
router.get("/verify-email-change", authController.verifyEmailChange);

// Secure Password Change (Requires authentication)
router.put("/change-password", authenticateJWT, authController.changePassword);

// Request Email Change (Requires authentication)
router.post("/request-email-change", authenticateJWT, authController.requestEmailChange);

module.exports = router;