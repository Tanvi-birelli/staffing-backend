const nodemailer = require("nodemailer");

// Generate OTP or token
const generateToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 30; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

// Generate OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Send OTP to Email (transporter created inside)
const sendOTP = async (email, code) => {
  console.log('Attempting to send OTP email to:', email);
  console.log('Using user:', process.env.GMAIL_USER);

  // Create transporter inside the function
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Your OTP Code",
      text: `Your OTP is ${code}. It expires in 5 minutes.`,
    });
    console.log('OTP email sent successfully to', email);

  } catch (error) {
      console.error('Error sending OTP email to', email, ':', error);
      throw error; // Re-throw the error
  }
};

// Send Password Reset Email
const sendPasswordResetEmail = async (toEmail, resetLink) => {
  console.log('Attempting to send password reset email to:', toEmail);
  console.log('Using user:', process.env.GMAIL_USER);

  // Create transporter inside the function
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
  });

  const emailSubject = 'Password Reset Request';
  const emailText = `You are receiving this because you (or someone else) has requested the reset of the password for your account.\n\nPlease click on the following link, or paste this into your browser to complete the process:\n${resetLink}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.`;

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: toEmail,
      subject: emailSubject,
      text: emailText,
    });
    console.log('Password reset email sent successfully to', toEmail);

  } catch (error) {
      console.error('Error sending password reset email to', toEmail, ':', error);
      throw error; // Re-throw the error
  }
};

// Send Email Verification Email
const sendEmailVerificationEmail = async (toEmail, verificationLink) => {
  console.log('Attempting to send email verification email to:', toEmail);
  console.log('Using user:', process.env.GMAIL_USER);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
  });

  const emailSubject = 'Verify Your Email Address';
  const emailText = `Please click on the following link to verify your new email address:\n${verificationLink}\n\nIf you did not request this email change, please ignore this email.`;

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: toEmail,
      subject: emailSubject,
      text: emailText,
    });
    console.log('Email verification email sent successfully to', toEmail);

  } catch (error) {
      console.error('Error sending email verification email to', toEmail, ':', error);
      throw error; // Re-throw the error
  }
};

module.exports = {
    generateOTP,
    sendOTP,
    sendPasswordResetEmail,
    generateToken,
    sendEmailVerificationEmail,
    // transporter is no longer exported
}; 