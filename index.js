const express = require("express");
const cors = require("cors");
const corsOptions = {
  origin: "http://localhost:5173", // Vite's default port
  credentials: true,
};
const dotenv = require("dotenv");
const path = require("path");
const { signInOtpLimiter, LoginOtpLimiter } = require("./utils/rateLimiters.js");
// const { padNumber, getNextIds, updateIds, loadUsers, saveUsers, loadContacts, saveContacts, loadAnnouncements, saveAnnouncements, loadJSON, saveJSON } = require("./utils/fileHelpers.js");
const { generateOTP, sendOTP } = require("./utils/otpHelpers.js");
const validatePassword = require("./utils/passwordHelpers.js");
const { upload, imageUpload } = require("./utils/multerConfig.js");
const authenticateJWT = require("./middleware/auth.middleware.js");
const authorize = require("./middleware/role.middleware.js");
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
  if (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
  next();
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const uploadDir = path.join(__dirname, "uploads");
const announcementsDir = path.join(uploadDir, "announcements");
require("fs").mkdirSync(uploadDir, { recursive: true });
require("fs").mkdirSync(announcementsDir, { recursive: true });


app.use('/api', authRoutes);
app.use('/api', contactRoutes);
app.use('/api', announcementRoutes);
app.use('/api', adminRoutes);
app.use('/api', hrRoutes);
app.use('/api/jobseeker', jobseekerRoutes);


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
