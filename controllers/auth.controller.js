const bcrypt = require("bcryptjs");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { loadUsers, saveUsers, updateIds, loadJSON, saveJSON } = require("../utils/fileHelpers");
const { generateOTP, sendOTP, sendPasswordResetEmail, generateToken, sendEmailVerificationEmail } = require("../utils/otpHelpers");
const validatePassword = require("../utils/passwordHelpers");
const crypto = require('crypto'); // Import crypto for token generation
const { findUserByEmail, createUser, updateUser, findUserByResetToken, findUserByVerificationToken, createPendingSignup, findPendingSignupByEmail, updatePendingSignup, deletePendingSignup, findPendingSignupByToken } = require("../utils/dbHelpers");
const { pool } = require("../utils/dbHelpers");

// const tempUsers = {}; // This will be replaced by pending_signups table

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
  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    return res.status(400).json({
      error: "Password does not meet the requirements:",
      details: passwordErrors
    });
  }

  if (!["superadmin", "admin", "hr", "jobseeker"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return res.status(400).json({ error: "Account already exists" });
  }

  let pendingSignup = await findPendingSignupByEmail(email);
  const now = Date.now();
  const OTP_COOLDOWN = 30 * 1000; // 30 seconds
  const SIGNUP_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

  if (pendingSignup) {
    // Check if currently blocked for signup
    if (pendingSignup.blockExpires && pendingSignup.blockExpires > now) {
      const remainingMillis = pendingSignup.blockExpires - now;
      const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
      return res.status(429).json({ error: `Too many signup attempts. Please try again in ${remainingMinutes} minute(s).` });
    }
    // Check OTP resend cooldown
    if (pendingSignup.lastOtpSent && (now - pendingSignup.lastOtpSent) < OTP_COOLDOWN) {
      const remainingSeconds = Math.ceil((OTP_COOLDOWN - (now - pendingSignup.lastOtpSent)) / 1000);
      console.log(`Debug: Cooldown active. Remaining seconds: ${remainingSeconds}`); // Debugging line
      return res.status(429).json({ error: `Please wait ${remainingSeconds} second(s) before requesting another OTP.` });
    }
  }

  const otp = generateOTP();
  const tempToken = uuidv4();
  const otpExpires = now + 5 * 60 * 1000; // OTP valid for 5 minutes

  const signupData = {
    name,
    email,
    hashedPassword: await bcrypt.hash(password, 10),
    resume_filepath: file,
    role,
    otpCode: otp,
    otpExpires: otpExpires,
    lastOtpSent: now,
    otpAttempts: 0,
    blockExpires: null // Reset block for new attempt
  };

  try {
    if (pendingSignup) {
      await updatePendingSignup(pendingSignup.id, { tempToken, ...signupData }); // Update existing pending signup with new tempToken
    } else {
      await createPendingSignup({ tempToken, ...signupData }); // Create new pending signup
    }
    console.log("Debug: Sending OTP."); // Debugging line
    await sendOTP(email, otp);
    res.json({ message: "OTP sent", tempToken });
  } catch (error) {
    console.error("Failed to send OTP or save pending signup:", error);
    return res.status(500).json({ error: "Failed to send OTP or process signup" });
  }
};

// Login with Password Controller
const loginPassword = async (req, res) => {
  const { email, password } = req.body;

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const user = await findUserByEmail(email);

  if (!user) return res.status(400).json({ error: "Account not found" });

  const now = Date.now();
  const GLOBAL_LOGIN_ATTEMPTS_LIMIT = 5;
  const ACCOUNT_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

  if (user.lockoutExpires && user.lockoutExpires > now) {
      const remainingMillis = user.lockoutExpires - now;
      const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
      return res.status(429).json({ error: `Account temporarily blocked. Please try again in ${remainingMinutes} minute(s).` });
  }

  if (!user.verified)
    return res.status(400).json({ error: "Account not verified" });

  if (!(await bcrypt.compare(password, user.password))) {
    let updates = {};
    const newLoginAttempts = (user.loginAttempts || 0) + 1;
    updates.loginAttempts = newLoginAttempts;
    updates.lastFailedLoginAttempt = now;

    let errorMessage = "Incorrect password.";
    let attemptsLeft = GLOBAL_LOGIN_ATTEMPTS_LIMIT - newLoginAttempts;

    if (newLoginAttempts >= GLOBAL_LOGIN_ATTEMPTS_LIMIT) {
      updates.lockoutExpires = now + ACCOUNT_BLOCK_DURATION;
      const blockDurationMinutes = Math.ceil(ACCOUNT_BLOCK_DURATION / (60 * 1000));
      errorMessage = `Too many incorrect password attempts (${GLOBAL_LOGIN_ATTEMPTS_LIMIT}). Account temporarily blocked. Please try again in ${blockDurationMinutes} minute(s).`;
      attemptsLeft = 0; // No attempts left
    } else {
      errorMessage += ` ${attemptsLeft} attempts left.`;
    }

    await updateUser(user.id, updates);
    return res.status(400).json({ error: errorMessage, attemptsLeft: attemptsLeft });
  }

  // Successful password login - reset all login-related counters
  await updateUser(user.id, { loginAttempts: 0, otp: null, otpExpires: null, otpAttempts: 0, lastFailedLoginAttempt: null, lockoutExpires: null, lastOtpSent: null });

  const jwtToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({
    message: "Logged in Successfully",
    token: jwtToken,
    data: { email: user.email, role: user.role, name: user.username, id: user.id },
  });

};

// Request Login OTP Controller
const requestLoginOTP = async (req, res) => {
  const { email } = req.body;

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const user = await findUserByEmail(email);

  if (!user) return res.status(400).json({ error: "Account not found" });

  const now = Date.now();
  const OTP_COOLDOWN = 30 * 1000; // 30 seconds
  const ACCOUNT_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

  if (user.lockoutExpires && user.lockoutExpires > now) {
    const remainingMillis = user.lockoutExpires - now;
    const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
    return res.status(429).json({ error: `Account temporarily blocked. Please try again in ${remainingMinutes} minute(s).` });
  }

  if (!user.verified)
    return res.status(400).json({ error: "Account not verified" });

  if (user.lastOtpSent && (now - user.lastOtpSent) < OTP_COOLDOWN) {
    const remainingSeconds = Math.ceil((OTP_COOLDOWN - (now - user.lastOtpSent)) / 1000);
    return res.status(429).json({ error: `Please wait ${remainingSeconds} second(s) before requesting another OTP.` });
  }

  // Clear existing OTP attempts if a new request comes after cooldown and no current lockout
  if (user.otpAttempts > 0 || user.loginAttempts > 0) {
    await updateUser(user.id, { otpAttempts: 0, loginAttempts: 0, lastFailedLoginAttempt: null });
  }

  const otp = generateOTP();
  const otpExpires = now + 5 * 60 * 1000;

  try {
    await updateUser(user.id, { otp: otp, otpExpires: otpExpires, lastOtpSent: now });
    console.log(`Debug: requestLoginOTP - User ID: ${user.id}, OTP set: ${otp}, OTP Expires: ${new Date(otpExpires).toLocaleString()}, Current Time: ${new Date(now).toLocaleString()}`);
    await sendOTP(email, otp);
    res.json({ message: "OTP sent", expires: otpExpires });
  } catch (error) {
    console.error("OTP Send Error:", error);
    // If sending fails, clear the OTP data and mark last sent for cooldown but don't block
    await updateUser(user.id, { otp: null, otpExpires: null, lastOtpSent: now }); 
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
    if (!tempToken) {
      return res.status(400).json({ error: "Invalid or missing token" });
    }

    const pendingSignup = await findPendingSignupByToken(tempToken);

    if (!pendingSignup || pendingSignup.email !== email) {
      return res.status(400).json({ error: "Invalid or expired token, or email mismatch" });
    }

    const now = Date.now();
    const SIGNUP_OTP_ATTEMPTS_LIMIT = 3;
    const SIGNUP_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

    if (pendingSignup.blockExpires && pendingSignup.blockExpires > now) {
      const remainingMillis = pendingSignup.blockExpires - now;
      const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
      return res.status(429).json({ error: `Too many signup attempts. Please try again in ${remainingMinutes} minute(s).` });
    }

    if (pendingSignup.otpExpires < now) {
      await deletePendingSignup(pendingSignup.id);
      return res.status(400).json({ error: "OTP expired" });
    }

    if (pendingSignup.otpCode !== otp) {
      const newAttempts = (pendingSignup.otpAttempts || 0) + 1;
      let updates = { otpAttempts: newAttempts };
      let errorMessage = "Incorrect OTP.";
      let attemptsLeft = SIGNUP_OTP_ATTEMPTS_LIMIT - newAttempts;

      if (newAttempts >= SIGNUP_OTP_ATTEMPTS_LIMIT) {
        updates.blockExpires = now + SIGNUP_BLOCK_DURATION;
        const blockDurationMinutes = Math.ceil(SIGNUP_BLOCK_DURATION / (60 * 1000));
        errorMessage = `Too many incorrect OTP attempts (${SIGNUP_OTP_ATTEMPTS_LIMIT}). Account temporarily blocked for signup. Please try again in ${blockDurationMinutes} minute(s).`;
        attemptsLeft = 0; // No attempts left
      } else {
        errorMessage += ` ${attemptsLeft} attempts left.`;
      }

      await updatePendingSignup(pendingSignup.id, updates);
      return res.status(400).json({ error: errorMessage, attemptsLeft: attemptsLeft });
    }

    // OTP correct - add user to permanent store
    try {
      // Generate VOAT ID
      const allUsers = await findUserByEmail(null); // Get all users to find next available VOAT ID suffix
      let nextVoatIdSuffix = 0;
      if (allUsers && allUsers.length > 0) {
          const voatIds = allUsers.map(user => user.voat_id).filter(Boolean).map(voatId => parseInt(voatId.split('-')[1]));
          nextVoatIdSuffix = voatIds.length > 0 ? Math.max(...voatIds) + 1 : 1;
      } else {
          nextVoatIdSuffix = 1;
      }
      const voatId = `VOAT-${String(nextVoatIdSuffix).padStart(3, '0')}`;

      await createUser({
        username: pendingSignup.name,
        email: pendingSignup.email,
        hashedPassword: pendingSignup.hashedPassword,
        role: pendingSignup.role,
        voatId: voatId,
        verified: true,
        resume_filepath: pendingSignup.resume_filepath
      });

      await deletePendingSignup(pendingSignup.id);
      res.json({ message: "Signup verified successfully" });
    } catch (error) {
      console.error("Error creating user in DB during signup verification:", error);
      return res.status(500).json({ error: "Failed to verify OTP and create user" });
    }

  } else if (type === "login") {
    // Verify login OTP
    const user = await findUserByEmail(email);
    if (!user) return res.status(400).json({ error: "Account not found" });

    const now = Date.now();
    console.log(`Debug: verifyOTP (login) - User ID: ${user.id}, Stored OTP: ${user.otp}, Stored OTP Expires: ${new Date(user.otpExpires).toLocaleString()}, Current Time: ${new Date(now).toLocaleString()}`);
    const GLOBAL_LOGIN_ATTEMPTS_LIMIT = 5;
    const OTP_LOGIN_ATTEMPTS_LIMIT = 3;
    const ACCOUNT_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

    if (user.lockoutExpires && user.lockoutExpires > now) {
        const remainingMillis = user.lockoutExpires - now;
        const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
        return res.status(429).json({ error: `Account temporarily blocked. Please try again in ${remainingMinutes} minute(s).` });
    }

    if (!user.verified)
      return res.status(400).json({ error: "Account not verified" });

    if (!user.otp || user.otpExpires < now) {
      // This means OTP is expired or not found, but it should have been handled by requestLoginOTP's cooldown.
      // If it still happens here, it means OTP expired during entry, or an invalid OTP was provided without being in cooldown.
      return res.status(400).json({ error: "OTP expired or not found. Please request a new one." });
    }

    if (user.otp !== otp) {
      let updates = {};
      let errorMessage = "Incorrect OTP.";

      // Increment OTP-specific attempts
      const newOtpAttempts = (user.otpAttempts || 0) + 1;
      updates.otpAttempts = newOtpAttempts;

      // Increment overall login attempts
      const newLoginAttempts = (user.loginAttempts || 0) + 1;
      updates.loginAttempts = newLoginAttempts;
      updates.lastFailedLoginAttempt = now; // Record time of failure

      let otpAttemptsLeft = OTP_LOGIN_ATTEMPTS_LIMIT - newOtpAttempts;
      let totalAttemptsLeft = GLOBAL_LOGIN_ATTEMPTS_LIMIT - newLoginAttempts;

      if (newOtpAttempts >= OTP_LOGIN_ATTEMPTS_LIMIT) {
          errorMessage = `Too many incorrect OTP attempts (${OTP_LOGIN_ATTEMPTS_LIMIT}).`;
          updates.lockoutExpires = now + ACCOUNT_BLOCK_DURATION; // Block account
          otpAttemptsLeft = 0;
      }
      if (newLoginAttempts >= GLOBAL_LOGIN_ATTEMPTS_LIMIT) {
          errorMessage = `Too many overall login attempts (${GLOBAL_LOGIN_ATTEMPTS_LIMIT}).`;
          updates.lockoutExpires = now + ACCOUNT_BLOCK_DURATION; // Block account
          totalAttemptsLeft = 0;
      }
      if (newOtpAttempts < OTP_LOGIN_ATTEMPTS_LIMIT) {
        errorMessage += ` ${otpAttemptsLeft} OTP attempts left.`;
      }
      if (newLoginAttempts < GLOBAL_LOGIN_ATTEMPTS_LIMIT) {
        errorMessage += ` ${totalAttemptsLeft} total login attempts left.`;
      }

      await updateUser(user.id, updates);
      return res.status(400).json({ error: errorMessage, otpAttemptsLeft, totalAttemptsLeft });
    }

    // Successful OTP verification - reset all login-related counters
    await updateUser(user.id, { loginAttempts: 0, otp: null, otpExpires: null, otpAttempts: 0, lastFailedLoginAttempt: null, lockoutExpires: null, lastOtpSent: now });

    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role }, // Include user ID in token
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Logged in Successfully",
      token: jwtToken,
      data: { email: user.email, role: user.role, name: user.username, id: user.id }, // Include user ID in data
    });
  }
};

// Request Password Reset Controller
const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const user = await findUserByEmail(email);
  
  // Security Best Practice: Respond generically to prevent user enumeration
  if (!user) {
    console.log(`Password reset requested for non-existent email: ${email}`);
    return res.json({ message: "If an account with that email exists, a password reset link has been sent." });
  }

  const token = generateToken();
  const resetExpires = Date.now() + 3600000; // 1 hour

  try {
    await updateUser(user.id, { resetToken: token, resetExpires: resetExpires });
    await sendPasswordResetEmail(email, token);
    res.json({ message: "If an account with that email exists, a password reset link has been sent." });
  } catch (error) {
    console.error("Password Reset Email Error:", error);
    // On error, still return generic message to avoid revealing user existence
    return res.status(500).json({ message: "An error occurred while sending the password reset email. Please try again later." });
  }
};

// Reset Password Controller
const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }
  const passwordErrors = validatePassword(newPassword);
  if (passwordErrors.length > 0) {
    return res.status(400).json({
      error: "Password does not meet the requirements:",
      details: passwordErrors
    });
  }

  const userToReset = await findUserByResetToken(token);

  if (!userToReset) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  try {
    await updateUser(userToReset.id, {
      password: hashedPassword,
      resetToken: null,
      resetExpires: null,
    });
    res.json({ message: "Password has been reset" });
  } catch (error) {
    console.error("Password Reset Error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

// Verify Email Controller (for initial signup verification)
const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: "Verification token required" });
  }

  const userToVerify = await findUserByVerificationToken(token);

  if (!userToVerify) {
    return res.status(400).json({ error: "Invalid or expired verification token" });
  }

  try {
    await updateUser(userToVerify.id, { verified: true, verificationToken: null });
    res.json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Email Verification Error:", error);
    res.status(500).json({ error: "Failed to verify email" });
  }
};

// Secure Password Change Controller
const changePassword = async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const passwordErrors = validatePassword(newPassword);
  if (passwordErrors.length > 0) {
    return res.status(400).json({
      error: "New password does not meet the requirements:",
      details: passwordErrors
    });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(400).json({ error: "Account not found" });
  }

  if (!(await bcrypt.compare(oldPassword, user.password))) {
    return res.status(400).json({ error: "Incorrect old password" });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  try {
    await updateUser(user.id, { password: hashedPassword });
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
};

// Request Email Change Controller
const requestEmailChange = async (req, res) => {
  const { oldEmail, newEmail } = req.body;

  if (!validator.isEmail(oldEmail) || !validator.isEmail(newEmail)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const user = await findUserByEmail(oldEmail);
  // Security Best Practice: Respond generically if old email not found
  if (!user) {
    console.log(`Email change requested for non-existent old email: ${oldEmail}`);
    return res.status(400).json({ error: "Invalid request or account not found." }); // Generic error
  }

  const existingNewEmailUser = await findUserByEmail(newEmail);
  if (existingNewEmailUser) {
    return res.status(400).json({ error: "New email is already in use" });
  }

  const verificationToken = generateToken();
  const verificationExpires = Date.now() + 3600000; // 1 hour

  try {
    await updateUser(user.id, { newEmail: newEmail, verificationToken: verificationToken, verificationExpires: verificationExpires });
    await sendEmailVerificationEmail(newEmail, verificationToken);
    res.json({ message: "Verification email sent to new email (if account exists)." }); // Generic success message
  } catch (error) {
    console.error("Request Email Change Error:", error);
    return res.status(500).json({ error: "Failed to send verification email." }); // Generic error
  }
};

const verifyEmailChange = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: "Verification token required" });
  }

  const userToVerify = await findUserByVerificationToken(token);

  if (!userToVerify || !userToVerify.newEmail) {
    return res.status(400).json({ error: "Invalid or expired verification token, or no pending email change." });
  }

  // Check if the token has expired (though findUserByVerificationToken already does this for reset/signup)
  // For email change, it's tied to 'newEmail' which might not have 'verificationExpires' directly linked to it in the same way as `verificationToken` column.
  // Re-checking the general `verificationExpires` on the user object is good.
  if (userToVerify.verificationExpires < Date.now()) {
    await updateUser(userToVerify.id, { newEmail: null, verificationToken: null, verificationExpires: null });
    return res.status(400).json({ error: "Verification token has expired. Please request a new email change." });
  }

  try {
    // Update the primary email and clear pending change fields
    await updateUser(userToVerify.id, {
      email: userToVerify.newEmail, // Set new email as primary
      newEmail: null,
      verificationToken: null,
      verificationExpires: null,
    });
    res.json({ message: "Email address updated successfully" });
  } catch (error) {
    console.error("Email Change Verification Error:", error);
    res.status(500).json({ error: "Failed to verify and update email address." });
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
    verifyEmail,
    changePassword,
    requestEmailChange,
    verifyEmailChange,
    // tempUsers // No longer needed, removed from export
}; 