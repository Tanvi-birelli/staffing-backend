const rateLimit = require("express-rate-limit");

const signInOtpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  message: "Too many OTP requests, try again later.",
  keyGenerator: (req, res) => req.body.email || req.ip,
});

const LoginOtpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 15,
  message: "Too many OTP requests, try again later.",
  keyGenerator: (req, res) => req.body.email || req.ip,
});

module.exports = {
  signInOtpLimiter,
  LoginOtpLimiter
}; 