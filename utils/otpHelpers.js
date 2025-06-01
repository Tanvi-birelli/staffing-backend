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

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
  });

  const companyName = process.env.COMPANY_NAME || "Your Company Name"; // Use env variable or fallback

  try {
    await transporter.sendMail({
      from: `"${companyName}" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `${code} is Your ${companyName} Verification Code`,
      text: `Your verification code for ${companyName} is ${code}.\nThis code is valid for 5 minutes. Do not share this code with anyone.`, // Plain text fallback
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #0056b3;">Your Verification Code</h2>
            <p>Hello,</p>
            <p>Your verification code for <strong>${companyName}</strong> is:</p>
            <h1 style="color: #0056b3; background-color: #f0f0f0; padding: 10px 20px; border-radius: 5px; display: inline-block;">${code}</h1>
            <p>This code is valid for <strong>5 minutes</strong>. For your security, please do not share this code with anyone.</p>
            <p>If you did not request this code, please ignore this email.</p>
            <p>Thank you,<br/>The ${companyName} Team</p>
            <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;"/>
            <p style="font-size: 0.8em; color: #777;">This is an automated email, please do not reply.</p>
        </div>
      `,
    });
    console.log('OTP email sent successfully to', email);

  } catch (error) {
      console.error('Error sending OTP email to', email, ':', error);
      console.error('Full email sending error object:', JSON.stringify(error, null, 2));
      throw error;
  }
};

// Send Password Reset Email
const sendPasswordResetEmail = async (toEmail, resetLink) => {
  console.log('Attempting to send password reset email to:', toEmail);
  console.log('Using user:', process.env.GMAIL_USER);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
  });

  const companyName = process.env.COMPANY_NAME || "Your Company Name"; // Use env variable or fallback

  try {
    await transporter.sendMail({
      from: `"${companyName}" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: `${companyName} - Password Reset Request`,
      text: `You are receiving this because you (or someone else) has requested the reset of the password for your account.\n\nPlease click on the following link, or paste this into your browser to complete the process:\n${resetLink}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n\nThank you,\nThe ${companyName} Team\n\nThis is an automated email, please do not reply.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #0056b3;">Password Reset Request</h2>
            <p>Hello,</p>
            <p>You are receiving this email because we received a password reset request for your account.</p>
            <p>Please click on the button below to reset your password:</p>
            <p style="text-align: center;">
                <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Your Password</a>
            </p>
            <p>If the button above doesn't work, you can also copy and paste the following link into your browser:</p>
            <p><a href="${resetLink}">${resetLink}</a></p>
            <p>This link is valid for 1 hour. If you did not request a password reset, please ignore this email and your password will remain unchanged.</p>
            <p>Thank you,<br/>The ${companyName} Team</p>
            <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;"/>
            <p style="font-size: 0.8em; color: #777;">This is an automated email, please do not reply.</p>
        </div>
      `,
    });
    console.log('Password reset email sent successfully to', toEmail);

  } catch (error) {
      console.error('Error sending password reset email to', toEmail, ':', error);
      throw error;
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

  const companyName = process.env.COMPANY_NAME || "Your Company Name"; // Use env variable or fallback

  try {
    await transporter.sendMail({
      from: `"${companyName}" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: `${companyName} - Verify Your Email Address`,
      text: `Hello,\n\nThank you for signing up with ${companyName}! Please click on the following link to verify your email address:\n${verificationLink}\n\nThis link is valid for 1 hour.\n\nIf you did not sign up for an account, please ignore this email.\n\nThank you,\nThe ${companyName} Team\n\nThis is an automated email, please do not reply.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #0056b3;">Verify Your Email Address</h2>
            <p>Hello,</p>
            <p>Thank you for signing up with <strong>${companyName}</strong>! To complete your registration and activate your account, please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
                <a href="${verificationLink}" style="display: inline-block; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">Verify Your Email</a>
            </p>
            <p>If the button above doesn't work, you can also copy and paste the following link into your browser:</p>
            <p><a href="${verificationLink}">${verificationLink}</a></p>
            <p>This link is valid for 1 hour. If you did not sign up for an account with us, please ignore this email.</p>
            <p>Thank you,<br/>The ${companyName} Team</p>
            <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;"/>
            <p style="font-size: 0.8em; color: #777;">This is an automated email, please do not reply.</p>
        </div>
      `,
    });
    console.log('Email verification email sent successfully to', toEmail);

  } catch (error) {
      console.error('Error sending email verification email to', toEmail, ':', error);
      console.error('Full email sending error object:', JSON.stringify(error, null, 2));
      throw error;
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