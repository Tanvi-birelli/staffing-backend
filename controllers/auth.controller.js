const bcrypt = require("bcryptjs");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { loadUsers, saveUsers, updateIds, loadJSON, saveJSON } = require("../utils/fileHelpers");
const { generateOTP, sendOTP, sendPasswordResetEmail, generateToken, sendEmailVerificationEmail } = require("../utils/otpHelpers");
const validatePassword = require("../utils/passwordHelpers");
const crypto = require('crypto'); // Import crypto for token generation
const { findUserByEmail, createUser, updateUser, findUserByResetToken, findUserByVerificationToken, createPendingSignup, findPendingSignupByEmail, updatePendingSignup, deletePendingSignup, findPendingSignupByToken, findMaxVoatIdSuffix } = require("../utils/dbHelpers");
const { pool } = require("../utils/dbHelpers");

// const tempUsers = {}; // This will be replaced by pending_signups table

// Signup Controller
const signup = async (req, res) => {
  
  const { name, email, password, role } = req.body;
  const file = role === "jobseeker" ? req.file?.filename : null;
  //console.log("name:", name);
  //console.log("email:", email);
  //console.log("password:", password);
  //console.log("role:", role);
  //console.log("file:", file);

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
    // Ambiguous response to prevent email enumeration for existing, verified users
    return res.json({ message: "If an account with that email exists, please proceed to login or password reset." });
  }

  let pendingSignup = await findPendingSignupByEmail(email);
  const now = Date.now();
  const SIGNUP_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

  if (pendingSignup) {
    // Check if currently blocked for signup
    if (pendingSignup.blockExpires && pendingSignup.blockExpires > now) {
      const remainingMillis = pendingSignup.blockExpires - now;
      const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
      
      return res.status(429).json({ error: `Too many signup attempts. Please try again in ${remainingMinutes} minute(s).` });
    }

    // If pending signup exists and not blocked, direct to resend OTP endpoint
    return res.status(200).json({
        message: "A pending signup already exists for this email. Please verify OTP or use the resend OTP endpoint.",
        tempToken: pendingSignup.tempToken // Provide the existing tempToken
    });
  }

  // If no existing user and no pending signup, proceed with new signup process
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
    otpAttempts: 0, // Initial send attempt count for this new pending signup
    blockExpires: null // No initial block
  };

  try {
    await createPendingSignup({ tempToken, ...signupData });
    console.log("Debug: Sending OTP for new signup.");
    await sendOTP(email, otp);
    res.json({ message: "OTP sent", tempToken });
  } catch (error) {
    console.error("Failed to send OTP or save pending signup:", error);
    return res.status(500).json({ error: "Failed to send OTP or process signup" });
  }
};

// Resend Signup OTP Controller
const resendSignupOTP = async (req, res) => {
  const { email, tempToken } = req.body;

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  if (!tempToken) {
    return res.status(400).json({ error: "Invalid or missing temporary token." });
  }

  const pendingSignup = await findPendingSignupByToken(tempToken);

  if (!pendingSignup || pendingSignup.email !== email) {
    return res.status(400).json({ error: "Invalid or expired token, or email mismatch." });
  }

  const now = Date.now();
  const OTP_COOLDOWN = 30 * 1000; // 30 seconds
  const MAX_OTP_SEND_ATTEMPTS = 3; // Max times OTP can be sent for a single signup attempt
  const SIGNUP_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

  // Check if currently blocked for sending OTPs
  if (pendingSignup.blockExpires && pendingSignup.blockExpires > now) {
    const remainingMillis = pendingSignup.blockExpires - now;
    const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
    return res.status(429).json({ error: `Too many OTP send attempts. Please try again in ${remainingMinutes} minute(s).` });
  }

  // Check OTP resend cooldown
  if (pendingSignup.lastOtpSent && (now - pendingSignup.lastOtpSent) < OTP_COOLDOWN) {
    const remainingSeconds = Math.ceil((OTP_COOLDOWN - (now - pendingSignup.lastOtpSent)) / 1000);
    return res.status(429).json({ error: `Please wait ${remainingSeconds} second(s) before requesting another OTP.` });
  }

  // Increment OTP send attempts
  const newOtpSendAttempts = (pendingSignup.otpAttempts || 0) + 1; // Re-purposing otpAttempts for send attempts
  let updates = { lastOtpSent: now, otpAttempts: newOtpSendAttempts };

  if (newOtpSendAttempts > MAX_OTP_SEND_ATTEMPTS) {
    updates.blockExpires = now + SIGNUP_BLOCK_DURATION;
    const blockDurationMinutes = Math.ceil(SIGNUP_BLOCK_DURATION / (60 * 1000));
    await updatePendingSignup(pendingSignup.id, updates);
    return res.status(429).json({ error: `Too many OTP send attempts (${MAX_OTP_SEND_ATTEMPTS}). Account temporarily blocked for sending OTPs. Please try again in ${blockDurationMinutes} minute(s).` });
  }

  const newOtp = generateOTP();
  updates.otpCode = newOtp;
  updates.otpExpires = now + 5 * 60 * 1000; // New OTP valid for 5 minutes

  try {
    await updatePendingSignup(pendingSignup.id, updates);
    await sendOTP(email, newOtp);
    res.json({ message: "New OTP sent successfully!", tempToken });
  } catch (error) {
    console.error("Error resending OTP:", error);
    return res.status(500).json({ error: "Failed to resend OTP." });
  }
};

// Login with Password Controller
const loginPassword = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

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
      return res.status(429).json({ error: `Account temporarily blocked due to too many login attempts. Please try again in ${remainingMinutes} minute(s).` });
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
      errorMessage = `Account temporarily blocked due to too many incorrect password attempts (${GLOBAL_LOGIN_ATTEMPTS_LIMIT} failed attempts). Please try again in ${blockDurationMinutes} minute(s).`;
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
    return res.status(429).json({ error: `Account temporarily blocked due to too many OTP requests. Please try again in ${remainingMinutes} minute(s).` });
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
      return res.status(429).json({ error: `Account temporarily blocked due to too many signup attempts. Please try again in ${remainingMinutes} minute(s).` });
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
        errorMessage = `Account temporarily blocked due to too many incorrect OTP attempts (${SIGNUP_OTP_ATTEMPTS_LIMIT} failed attempts). Please try again in ${blockDurationMinutes} minute(s).`;
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
      let nextVoatIdSuffix = await findMaxVoatIdSuffix();
      nextVoatIdSuffix += 1;
      const voatId = `VOAT-${String(nextVoatIdSuffix).padStart(3, '0')}`;

      const createdUserResult = await createUser({
        username: pendingSignup.name,
        email: pendingSignup.email,
        hashedPassword: pendingSignup.hashedPassword,
        role: pendingSignup.role,
        voatId: voatId,
      verified: true,
        resume_filepath: pendingSignup.resume_filepath
      });

      await deletePendingSignup(pendingSignup.id);
      // Generate JWT token for the newly created user
      const jwtToken = jwt.sign(
        { id: createdUserResult.id, email: pendingSignup.email, role: pendingSignup.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.json({
        message: "Signup verified successfully",
        token: jwtToken,
        data: { email: pendingSignup.email, role: pendingSignup.role, name: pendingSignup.name, id: createdUserResult.id }
      });
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
        return res.status(429).json({ error: `Account temporarily blocked due to too many login attempts. Please try again in ${remainingMinutes} minute(s).` });
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
          errorMessage = `Account temporarily blocked due to too many incorrect OTP attempts (${OTP_LOGIN_ATTEMPTS_LIMIT} failed attempts).`;
          updates.lockoutExpires = now + ACCOUNT_BLOCK_DURATION; // Block account
          otpAttemptsLeft = 0;
      }
      if (newLoginAttempts >= GLOBAL_LOGIN_ATTEMPTS_LIMIT) {
          errorMessage = `Account temporarily blocked due to too many overall login attempts (${GLOBAL_LOGIN_ATTEMPTS_LIMIT} failed attempts).`;
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

  // Check if the new password is the same as the old password
  if (await bcrypt.compare(newPassword, userToReset.password)) {
    return res.status(400).json({ error: "New password cannot be the same as the old password." });
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
  const { oldPassword, newPassword } = req.body;

  const user = req.user; // Get user from authenticated JWT payload

  if (!user) {
    return res.status(401).json({ error: "Unauthorized: User not found in token." }); // Should ideally not happen if auth middleware works
  }

  const passwordErrors = validatePassword(newPassword);
  if (passwordErrors.length > 0) {
    return res.status(400).json({
      error: "New password does not meet the requirements:",
      details: passwordErrors
    });
  }

  if (!(await bcrypt.compare(oldPassword, user.password))) {
    return res.status(400).json({ error: "Incorrect old password" });
  }

  // Check if the new password is the same as the old password
  if (await bcrypt.compare(newPassword, user.password)) {
    return res.status(400).json({ error: "New password cannot be the same as the old password." });
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

// Get Auth Status
const getAuthStatus = async (req, res) => {
  const { email } = req.query; // Expect email as a query parameter

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const pendingSignup = await findPendingSignupByEmail(email);
  const now = Date.now();

  let status = {
    attemptsLeft: 3, // Default for signup OTP send attempts (from MAX_OTP_SEND_ATTEMPTS)
    cooldown: 0, // In seconds
    blocked: false,
    blockExpires: 0,
    message: "Ready to send OTP"
  };

  if (pendingSignup) {
    const OTP_COOLDOWN = 30 * 1000; // 30 seconds
    const MAX_OTP_SEND_ATTEMPTS = 3; // Max times OTP can be sent for a single signup attempt
    const SIGNUP_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes

    if (pendingSignup.blockExpires && pendingSignup.blockExpires > now) {
      status.blocked = true;
      status.blockExpires = pendingSignup.blockExpires;
      const remainingMillis = pendingSignup.blockExpires - now;
      const remainingMinutes = Math.ceil(remainingMillis / (60 * 1000));
      status.message = `Too many OTP send attempts. Please try again in ${remainingMinutes} minute(s).`;
    } else if (pendingSignup.lastOtpSent && (now - pendingSignup.lastOtpSent) < OTP_COOLDOWN) {
      const remainingSeconds = Math.ceil((OTP_COOLDOWN - (now - pendingSignup.lastOtpSent)) / 1000);
      status.cooldown = remainingSeconds;
      status.message = `Please wait ${remainingSeconds} second(s) before requesting another OTP.`;
    } else {
        // Calculate remaining attempts
        status.attemptsLeft = MAX_OTP_SEND_ATTEMPTS - (pendingSignup.otpAttempts || 0);
        if (status.attemptsLeft < 0) status.attemptsLeft = 0; // Should not happen if blocking is working
        status.message = "Ready to send OTP";
    }

    // If a pending signup exists, but no block or cooldown, update attemptsLeft
    if (!status.blocked && status.cooldown === 0) {
        status.attemptsLeft = MAX_OTP_SEND_ATTEMPTS - (pendingSignup.otpAttempts || 0);
        if (status.attemptsLeft < 0) status.attemptsLeft = 0;
    }

  }

  res.json(status);
};

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
    resendSignupOTP,
    getAuthStatus
}; 