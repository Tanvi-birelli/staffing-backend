const bcrypt = require("bcryptjs");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { loadUsers, saveUsers, updateIds, loadJSON, saveJSON } = require("../utils/fileHelpers");
const { generateOTP, sendOTP, sendPasswordResetEmail } = require("../utils/otpHelpers");
const validatePassword = require("../utils/passwordHelpers");
const crypto = require('crypto'); // Import crypto for token generation

const tempUsers = {}; // This might need a more persistent solution later

// Signup Controller
const signup = async (req, res) => {
  const { name, email, password, role } = req.body;
  const file = role === "jobseeker" ? req.file?.filename : null;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Invalid name" });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (role === "jobseeker" && !req.file) {
    return res.status(400).json({ error: "Resume required for jobseekers" });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({
      error:
        "Password must be at least 6 characters, include uppercase & number",
    });
  }

  if (!["superadmin", "admin", "hr", "jobseeker"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  let users = loadUsers();
  if (users.find((u) => u.email === email)) {
    return res.status(400).json({ error: "Account already exists" });
  }

  const otp = generateOTP();
  const tempToken = uuidv4();
  const now = Date.now();

  tempUsers[tempToken] = {
    name,
    email,
    hashedPassword: await bcrypt.hash(password, 10),
    file,
    role,
    otpData: {
      code: otp,
      expiresAt: now + 5 * 60 * 1000,
      attempts: 0,
      lastSent: now,
    },
  };

  try {
    await sendOTP(email, otp);
  } catch (error) {
    console.error("Failed to send OTP:", error);
    return res.status(500).json({ error: "Failed to send OTP" });
  }

  res.json({ message: "OTP sent", tempToken });
};

// Login with Password Controller
const loginPassword = async (req, res) => {
  const { email, password } = req.body;

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  let users = loadUsers();
  const user = users.find((u) => u.email === email);

  if (!user) return res.status(400).json({ error: "Account not found" });
  if (!user.verified)
    return res.status(400).json({ error: "Account not verified" });

  if (!(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: "Incorrect password" });
  }

  const jwtToken = jwt.sign(
    { email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({
    message: "Logged in Successfully",
    token: jwtToken,
    data: { email: user.email, role: user.role, name: user.name },
  });

};

// Request Login OTP Controller
const requestLoginOTP = async (req, res) => {
  const { email } = req.body;

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  let users = loadUsers();
  const user = users.find((u) => u.email === email);

  if (!user) return res.status(400).json({ error: "Account not found" });
  if (!user.verified)
    return res.status(400).json({ error: "Account not verified" });

  if (user.loginAttempts >= 5) {
    return res.status(429).json({ error: "Account temporarily blocked" });
  }

  if (user.otp && user.otpExpires > Date.now()) {
    return res.status(400).json({ error: "OTP already sent" });
  }

  const otp = generateOTP();
  user.otp = otp;
  user.otpExpires = Date.now() + 5 * 60 * 1000;
  saveUsers(users);

  try {
    await sendOTP(email, otp);
    res.json({ message: "OTP sent", expires: user.otpExpires });
  } catch (error) {
    console.error("OTP Send Error:", error);
    delete user.otp;
    delete user.otpExpires;
    saveUsers(users);
    res.status(500).json({ error: "Failed to send OTP" });
  }
};

// Verify OTP Controller (Signup & Login)
const verifyOTP = async (req, res) => {
  const { email, otp, tempToken, type } = req.body;

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  if (!otp || otp.length !== 6) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  if (type === "signup") {
    // Verify signup OTP
    if (!tempToken || !tempUsers[tempToken]) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const tempUser = tempUsers[tempToken];
    if (tempUser.email !== email) {
      return res.status(400).json({ error: "Email mismatch" });
    }

    const now = Date.now();

    if (tempUser.otpData.expiresAt < now) {
      delete tempUsers[tempToken];
      return res.status(400).json({ error: "OTP expired" });
    }

    if (tempUser.otpData.code !== otp) {
      tempUser.otpData.attempts++;
      if (tempUser.otpData.attempts >= 5) {
        delete tempUsers[tempToken];
        return res.status(429).json({ error: "Too many failed attempts" });
      }
      return res.status(400).json({ error: "Incorrect OTP" });
    }
    // Generate IDs
    const userId = updateIds("userId");
    const voatId = `VOAT-${padNumber(updateIds("voatId"))}`;
    // OTP correct - add user to permanent store
    let users = loadUsers();
    users.push({
      user_id: userId,
      voat_id: voatId,
      name: tempUser.name,
      email: tempUser.email,
      password: tempUser.hashedPassword,
      resume: tempUser.file,
      role: tempUser.role,
      verified: true,
      //loginAttempts: 0,
      created_at: new Date().toISOString(),
    });
    saveUsers(users);

    if (tempUser.role === "jobseeker") {
      const jobseekers = loadJSON("jobseekers.json");
      jobseekers.push({
        user_id: userId,
        voat_id: voatId,
        resume: tempUser.file,
      });
      saveJSON("jobseekers.json", jobseekers);
    } else if (tempUser.role === "hr") {
      const hrs = loadJSON("hrs.json");
      hrs.push({
        user_id: userId,
        voat_id: voatId,
      });
      saveJSON("hrs.json", hrs);
    }
    delete tempUsers[tempToken];

    res.json({ message: "Signup verified successfully" });
  } else if (type === "login") {
    // Verify login OTP
    let users = loadUsers();
    const user = users.find((u) => u.email === email);
    if (!user) return res.status(400).json({ error: "Account not found" });
    if (!user.verified)
      return res.status(400).json({ error: "Account not verified" });

    if (!user.otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ error: "OTP expired or not found" });
    }

    if (user.otp !== otp) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      saveUsers(users);

      if (user.loginAttempts >= 5) {
        return res.status(429).json({ error: "Account temporarily blocked" });
      }

      return res.status(400).json({ error: "Incorrect OTP" });
    }

    user.loginAttempts = 0;
    delete user.otp;
    delete user.otpExpires;
    saveUsers(users);

    const jwtToken = jwt.sign(
      { email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token: jwtToken,
      data: { email: user.email, role: user.role },
    });
  } else {
    res.status(400).json({ error: "Invalid OTP verification type" });
  }
};

// Request Password Reset Controller
const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  let users = loadUsers();
  const user = users.find(u => u.email === email);

  // It's often a security best practice to respond the same way whether the email exists or not
  // to prevent enumeration attacks. However, for debugging file-based, let's be explicit first.
  if (!user) {
    console.log(`Password reset requested for non-existent email: ${email}`);
    // Respond as if successful to avoid revealing user existence
    return res.json({ message: "If a user with that email exists, a password reset link has been sent." });
  }

  try {
    // Generate a reset token (using a more robust method than UUID if possible, like crypto.randomBytes)
    // For simplicity with UUID, let's use it, but add expiry.
    const resetToken = uuidv4(); // Or use crypto.randomBytes(20).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // Token valid for 1 hour (3600000 ms)

    // Store the token and expiry with the user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    saveUsers(users); // Save the updated users array

    // Create the reset link
    // Replace process.env.FRONTEND_URL with your actual frontend base URL env var
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Send the email using the new helper function
    await sendPasswordResetEmail(user.email, resetLink);

    console.log(`Password reset email logic completed for: ${email}`);

    // Respond to the frontend
    res.json({ message: "If a user with that email exists, a password reset link has been sent." });

  } catch (error) {
    console.error(`Error requesting password reset for ${email}:`, error);
    // Respond with a generic message even on error to prevent revealing user existence
    res.status(500).json({ message: "An error occurred while processing your request. Please try again later." });
  }
};

// Reset Password Controller
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and new password are required" });
  }

  let users = loadUsers();

  // Find user by reset token and check expiry
  const user = users.find(u => u.resetPasswordToken === token);

  if (!user || user.resetPasswordExpires < Date.now()) {
    return res.status(400).json({ error: "Invalid or expired reset token" });
  }

  // Validate new password
  if (!validatePassword(newPassword)) {
    return res.status(400).json({
      error:
        "Password must be at least 6 characters, include uppercase & number",
    });
  }

  try {
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password and clear reset token fields
    user.password = hashedPassword;
    delete user.resetPasswordToken;
    delete user.resetPasswordExpires;

    saveUsers(users); // Save the updated users array

    console.log(`Password successfully reset for email: ${user.email}`);

    res.json({ message: "Password reset successful" });

  } catch (error) {
    console.error(`Error resetting password for token ${token}:`, error);
    res.status(500).json({ message: "An error occurred while resetting your password." });
  }
};

// Keep tempUsers in this file for now, or consider a more robust temporary storage
// Need padNumber function for verifyOTP signup case - assuming it's a helper
const padNumber = (num, length = 3) => String(num).padStart(length, "0");

module.exports = {
    signup,
    loginPassword,
    requestLoginOTP,
    verifyOTP,
    requestPasswordReset,
    resetPassword,
    tempUsers // Export tempUsers if needed elsewhere, otherwise keep internal
}; 