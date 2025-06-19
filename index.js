const express = require("express");
const cors = require("cors");
const corsOptions = {
  origin: "http://localhost:5174", // Vite's default port
  credentials: true,
};
const dotenv = require("dotenv");
const path = require("path");
const { signInOtpLimiter, LoginOtpLimiter } = require("./utils/rateLimiters.js");
// const { padNumber, getNextIds, updateIds, loadUsers, saveUsers, loadContacts, saveContacts, loadAnnouncements, saveAnnouncements, loadJSON, saveJSON } = require("./utils/fileHelpers.js");
const { generateOTP, sendOTP } = require("./utils/otpHelpers.js");
const validatePassword = require("./utils/passwordHelpers.js");
const { upload, imageUpload } = require("./utils/multerConfig.js");
const authRoutes = require("./routes/auth.routes.js");
const contactRoutes = require("./routes/contact.routes.js");
const announcementRoutes = require("./routes/announcement.routes.js");
const jobseekerRoutes = require("./routes/jobseeker.routes.js");
const adminRoutes = require("./routes/admin.routes.js");
const hrRoutes = require("./routes/hr.routes.js");
const { testDbConnection } = require("./config/db.js");

dotenv.config();
//console.log('DB_PASSWORD from .env:', process.env.DB_PASSWORD); 
// console.log('GMAIL_USER:', process.env.GMAIL_USER);
// console.log('GMAIL_APP_PASS:', process.env.GMAIL_APP_PASS);
require("./config/env.js");

testDbConnection();

const app = express();
const PORT = process.env.PORT|| 3001;

app.use(cors(corsOptions));
app.use(express.json());
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  // Handle custom file type errors from Multer's fileFilter
  if (err.message && err.message.startsWith("Invalid file type")) {
    return res.status(400).json({ error: { code: 400, message: err.message } });
  }
  return res.status(500).json({ error: "An unexpected server error occurred." });
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const uploadDir = path.join(__dirname, "uploads");
const announcementsDir = path.join(uploadDir, "announcements");
const resumesDir = path.join(uploadDir, "resumes");
require("fs").mkdirSync(uploadDir, { recursive: true });
require("fs").mkdirSync(announcementsDir, { recursive: true });
require("fs").mkdirSync(resumesDir, { recursive: true });

const fileFilter = (req, file, cb) => {
  const allowedTypes = [/pdf/, /doc/, /docx/];
  const isAllowed = allowedTypes.some(regex => regex.test(file.mimetype));
  if (isAllowed) {
    cb(null, true);
  } else {
    // This ensures the error is handled by Express and not as an uncaught exception
    process.nextTick(() => {
      cb(new Error("Invalid file type. Only PDF, DOC, and DOCX files are allowed."));
    });
  }
};

app.use('/api', authRoutes);
app.use('/api', contactRoutes);
app.use('/api', announcementRoutes);
app.use('/api', adminRoutes);
app.use('/api', hrRoutes);
app.use('/api/jobseeker', jobseekerRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
