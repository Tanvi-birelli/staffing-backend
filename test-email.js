// Save this as test-email.js in your backend directory

require('dotenv').config(); // Load environment variables

const nodemailer = require('nodemailer');

// Check if environment variables are loaded
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) {
    console.error('Error: GMAIL_USER or GMAIL_APP_PASS not loaded from .env');
    console.log('GMAIL_USER:', process.env.GMAIL_USER);
    console.log('GMAIL_APP_PASS:', process.env.GMAIL_APP_PASS);
    process.exit(1); // Exit if missing
}

console.log('Attempting to send test email using credentials:');
console.log('User:', process.env.GMAIL_USER);
// Be cautious about logging the password, even in a test script.
// console.log('Pass:', process.env.GMAIL_APP_PASS); // Avoid logging password

// Create a transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

// Email options
const mailOptions = {
  from: process.env.GMAIL_USER, // Sender address
  to: process.env.GMAIL_USER,   // Receiver address (send to yourself)
  subject: 'Test Email from Backend', // Subject line
  text: 'If you receive this email, your Gmail credentials and Nodemailer setup are working!', // Plain text body
};

// Send the email
transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error('Error sending email:');
    console.error(error);
  } else {
    console.log('Test email sent successfully!');
    console.log('Message ID:', info.messageId);
  }
});
