const nodemailer = require("nodemailer");

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

module.exports = {
    generateOTP,
    sendOTP,
    sendPasswordResetEmail,
    // transporter is no longer exported
}; 