const { pool } = require("../config/db");
const validator = require("validator");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { findJobseekerProfileByUserId, updateJobseekerResumePath, updateJobseekerProfile } = require("../utils/dbHelpers");

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads/resumes");
  },
  filename: (req, file, cb) => {
    cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

// Filter for resume file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [/pdf/, /doc/, /docx/];
  const isAllowed = allowedTypes.some(regex => regex.test(file.mimetype));
  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, DOC, and DOCX files are allowed."), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// GET /jobseeker/api/profile
const getProfile = async (req, res) => {
  try {
    const profile = await findJobseekerProfileByUserId(req.user.id);

    if (!profile) {
      return res.status(404).json({ error: "Jobseeker profile not found." });
    }

    res.json(profile);
  } catch (error) {
    console.error("Error fetching job seeker profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /jobseeker/api/profile/resume
const uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: 400, message: "No resume file provided." } });
    }

    const resume_filepath = `/uploads/resumes/${req.file.filename}`;

    // Update the jobseeker's resume_filepath in the database using the helper
    await updateJobseekerResumePath(req.user.id, resume_filepath);

    res.json({ message: "Resume uploaded successfully.", resumeUrl: resume_filepath });
  } catch (error) {
    console.error("Error uploading resume:", error);
    if (error.message === "Invalid file type. Only PDF, DOC, and DOCX files are allowed.") {
      return res.status(400).json({ error: { code: 400, message: error.message } });
    }
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: { code: 400, message: "File size exceeds limit (5MB)." } });
    }
    res.status(500).json({ error: { code: 500, message: "Failed to upload resume. Please try again." } });
  }
};

// GET /jobseeker/api/profile/resume
const getResume = async (req, res) => {
  try {
    const [jobseekers] = await pool.execute(
      "SELECT resume_filepath FROM jobseeker WHERE user_id = ?",
      [req.user.id]
    );
    const jobseeker = jobseekers[0];

    if (!jobseeker || !jobseeker.resume_filepath) {
      return res.status(404).json({ error: { code: 404, message: "Resume not found for this jobseeker." } });
    }

    const filePath = path.join(__dirname, "..", jobseeker.resume_filepath);

    // Check if file exists before sending
    if (!fs.existsSync(filePath)) {
      console.error(`Resume file not found: ${filePath}`);
      return res.status(404).json({ error: { code: 404, message: "Resume file not found on server." } });
    }

    res.download(filePath, (err) => {
      if (err) {
        console.error("Error sending resume file:", err);
        res.status(500).json({ error: { code: 500, message: "Failed to retrieve resume. Please try again." } });
      }
    });
  } catch (error) {
    console.error("Error retrieving resume:", error);
    res.status(500).json({ error: { code: 500, message: "Internal server error" } });
  }
};

// PUT /jobseeker/api/profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profileUpdates = req.body;

    const errors = [];

    // Input validation (simplified, as dbHelper handles data distribution)
    if (profileUpdates.name !== undefined && (typeof profileUpdates.name !== 'string' || profileUpdates.name.length > 255)) {
      errors.push("Name must be a string and less than 255 characters.");
    }
    if (profileUpdates.phone !== undefined && (typeof profileUpdates.phone !== 'string' || !validator.isMobilePhone(profileUpdates.phone, 'any'))) {
      errors.push("Phone must be a valid mobile number.");
    }
    if (profileUpdates.gender !== undefined && (typeof profileUpdates.gender !== 'string' || !['Male', 'Female', 'Other', 'Prefer not to say'].includes(profileUpdates.gender))) {
      errors.push("Gender must be 'Male', 'Female', 'Other', or 'Prefer not to say'.");
    }
    if (profileUpdates.address !== undefined && (typeof profileUpdates.address !== 'string' || profileUpdates.address.length > 1000)) {
      errors.push("Address must be a string and less than 1000 characters.");
    }
    if (profileUpdates.whatsapp !== undefined && (typeof profileUpdates.whatsapp !== 'string' || !validator.isMobilePhone(profileUpdates.whatsapp, 'any'))) {
      errors.push("Whatsapp must be a valid mobile number.");
    }
    if (profileUpdates.bio !== undefined && (typeof profileUpdates.bio !== 'string' || profileUpdates.bio.length > 1000)) {
      errors.push("Bio must be a string and less than 1000 characters.");
    }
    if (profileUpdates.portfolio !== undefined && (typeof profileUpdates.portfolio !== 'string' || !validator.isURL(profileUpdates.portfolio) || profileUpdates.portfolio.length > 500)) {
      errors.push("Portfolio must be a valid URL and less than 500 characters.");
    }
    if (profileUpdates.education !== undefined && (typeof profileUpdates.education !== 'string' || profileUpdates.education.length > 1000)) {
      errors.push("Education must be a string and less than 1000 characters.");
    }
    if (profileUpdates.experience_years !== undefined && (typeof profileUpdates.experience_years !== 'number' || profileUpdates.experience_years < 0 || profileUpdates.experience_years > 99)) {
      errors.push("Experience years must be a non-negative number and less than 100.");
    }

    // Validation for JSON fields (skills, projects, certifications)
    if (profileUpdates.skills !== undefined) {
      if (!Array.isArray(profileUpdates.skills) || profileUpdates.skills.some(s => typeof s !== 'string' || s.length > 50)) {
        errors.push("Skills must be an array of strings, each less than 50 characters.");
      }
    }
    if (profileUpdates.projects !== undefined) {
      if (!Array.isArray(profileUpdates.projects) || profileUpdates.projects.some(p => typeof p !== 'object' || p === null || !p.title || typeof p.title !== 'string' || p.title.length > 255)) {
        errors.push("Projects must be an array of objects with a title (string, max 255 chars).");
      }
    }
    if (profileUpdates.certifications !== undefined) {
      if (!Array.isArray(profileUpdates.certifications) || profileUpdates.certifications.some(c => typeof c !== 'object' || c === null || !c.name || typeof c.name !== 'string' || c.name.length > 255)) {
        errors.push("Certifications must be an array of objects with a name (string, max 255 chars).");
      }
    }

    // Validation for parentDetails object
    if (profileUpdates.parentDetails !== undefined) {
        if (typeof profileUpdates.parentDetails !== 'object' || profileUpdates.parentDetails === null) {
            errors.push("Parent details must be an object.");
        } else {
            if (profileUpdates.parentDetails.name !== undefined && (typeof profileUpdates.parentDetails.name !== 'string' || profileUpdates.parentDetails.name.length > 255)) {
                errors.push("Parent name must be a string and less than 255 characters.");
            }
            if (profileUpdates.parentDetails.phone !== undefined && (typeof profileUpdates.parentDetails.phone !== 'string' || !validator.isMobilePhone(profileUpdates.parentDetails.phone, 'any'))) {
                errors.push("Parent phone must be a valid mobile number.");
            }
            if (profileUpdates.parentDetails.relation !== undefined && (typeof profileUpdates.parentDetails.relation !== 'string' || profileUpdates.parentDetails.relation.length > 50)) {
                errors.push("Parent relation must be a string and less than 50 characters.");
            }
            if (profileUpdates.parentDetails.email !== undefined && (typeof profileUpdates.parentDetails.email !== 'string' || !validator.isEmail(profileUpdates.parentDetails.email))) {
                errors.push("Parent email must be a valid email address.");
            }
        }
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Pass the updates directly to the helper function
    await updateJobseekerProfile(userId, profileUpdates);

    // Fetch the updated profile to return the latest state
    const updatedProfile = await findJobseekerProfileByUserId(userId);

    res.json({ message: "Profile updated successfully.", profile: updatedProfile });
  } catch (error) {
    console.error("Error updating job seeker profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /jobseeker/api/jobs
const getJobs = async (req, res) => {
  try {
    const { q, experienceLevel, location, datePosted, isUrgent, page = 1, limit = 10 } = req.query;
    let query = "SELECT * FROM jobs WHERE 1=1";
    const params = [];

    if (q) {
      const searchTerm = `%${q}%`;
      query += " AND (title LIKE ? OR company LIKE ? OR description LIKE ?)";
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (experienceLevel) {
      query += " AND experience_level = ?";
      params.push(experienceLevel);
    }

    if (location) {
      query += " AND location LIKE ?";
      params.push(`%${location}%`);
    }

    if (datePosted) {
      const now = new Date();
      let dateFilter = null;
      if (datePosted === "last24hours") {
        dateFilter = new Date(now.setDate(now.getDate() - 1));
      } else if (datePosted === "last7days") {
        dateFilter = new Date(now.setDate(now.getDate() - 7));
      } else if (datePosted === "last30days") {
        dateFilter = new Date(now.setDate(now.getDate() - 30));
      }

      if (dateFilter) {
        query += " AND posted_date >= ?";
        params.push(dateFilter.toISOString().slice(0, 19).replace('T', ' ')); // Format for MySQL DATETIME
      }
    }

    if (isUrgent === 'true') {
      query += " AND is_urgent = 1";
    }

    // Count total jobs for pagination
    const [totalJobsResult] = await pool.execute(
      `SELECT COUNT(*) AS total FROM jobs WHERE 1=1${query.substring(query.indexOf('AND'))}`,
      params
    );
    const totalJobs = totalJobsResult[0].total;
    const totalPages = Math.ceil(totalJobs / limit);
    const offset = (page - 1) * limit;

    query += " LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [jobs] = await pool.execute(query, params);

    res.json({
      jobs: jobs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalJobs: totalJobs,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /jobseeker/api/jobs/:id
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: { code: 400, message: "Job ID is required." } });
    }

    const [jobs] = await pool.execute("SELECT * FROM jobs WHERE id = ?", [id]);
    const job = jobs[0];

    if (!job) {
      return res.status(404).json({ error: { code: 404, message: "Job posting not found." } });
    }

    res.json(job);
  } catch (error) {
    console.error("Error fetching job by ID:", error);
    res.status(500).json({ error: { code: 500, message: "Failed to retrieve job details. Please try again." } });
  }
};

// GET /jobseeker/api/jobs/applied
const getAppliedJobs = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT
        ja.application_id,
        j.id AS jobId,
        j.title,
        j.company,
        j.location,
        CONCAT(j.currency, j.min_salary, ' - ', j.currency, j.max_salary) AS salary,
        j.openings,
        ja.applied_date AS appliedDate,
        ja.status AS status,
        j.eligibility,
        j.description,
        j.work_mode,
        j.type,
        j.is_urgent AS isUrgent,
        j.is_new AS isNew
      FROM job_applications ja
      JOIN jobs j ON ja.job_id = j.id
      WHERE ja.jobseeker_id = ?`;
    const params = [req.user.id];

    if (status) {
      query += " AND ja.status = ?";
      params.push(status);
    }

    const [appliedJobs] = await pool.execute(query, params);
    res.json({ appliedJobs });
  } catch (error) {
    console.error("Error fetching applied jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /jobseeker/api/jobs/apply
const applyJob = async (req, res) => {
  const { job_id } = req.body;
  if (!job_id) {
    return res.status(400).json({ error: "Job ID required" });
  }

  try {
    // Get the jobseeker's current resume filepath
    const [jobseekers] = await pool.execute(
      "SELECT resume_filepath FROM jobseeker WHERE user_id = ?",
      [req.user.id]
    );
    const jobseeker = jobseekers[0];
    const resume_filepath = jobseeker ? jobseeker.resume_filepath : null;

    // Check if already applied
    const [existingApplication] = await pool.execute(
      "SELECT application_id FROM job_applications WHERE job_id = ? AND jobseeker_id = ?",
      [job_id, req.user.id]
    );

    if (existingApplication.length > 0) {
      return res.status(409).json({ error: { code: 409, message: "You have already applied for this job." } });
    }

    // Insert new application with resume_filepath and current timestamp
    const [result] = await pool.execute(
      "INSERT INTO job_applications (job_id, jobseeker_id, resume_filepath, applied_date, status) VALUES (?, ?, ?, NOW(), ?)",
      [job_id, req.user.id, resume_filepath, "Applied"]
    );

    const applicationId = result.insertId;

    res.status(201).json({
      message: "Job application submitted successfully",
      applicationId: applicationId,
      jobId: job_id,
      jobseekerId: req.user.id,
      status: "Applied",
      appliedDate: new Date().toISOString(), // Use current timestamp for response
    });
  } catch (error) {
    console.error("Error submitting application:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /jobseeker/api/schedule
const getSchedule = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = `
      SELECT
        se.event_id AS id,
        se.event_type AS type,
        se.event_title AS title,
        se.event_datetime AS date,
        se.event_location AS location,
        se.event_description AS description,
        -- Interview specific details
        i.interview_id,
        i.interview_type,
        i.interviewer_id,
        i.status AS interviewStatus,
        i.notes AS interviewNotes,
        -- Job Application details
        ja.application_id,
        ja.status AS applicationStatus,
        -- Job details
        j.id AS jobId,
        j.title AS jobTitle,
        j.company AS companyName
      FROM scheduled_events se
      LEFT JOIN interviews i ON se.event_id = i.scheduled_event_id AND se.event_type = 'interview'
      LEFT JOIN job_applications ja ON i.application_id = ja.application_id
      LEFT JOIN jobs j ON ja.job_id = j.id
      WHERE se.user_id = ?
    `;
    const params = [req.user.id];

    if (startDate) {
      query += ` AND se.event_datetime >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND se.event_datetime <= ?`;
      params.push(endDate);
    }

    // Add ordering to the query
    query += ` ORDER BY se.event_datetime ASC`;

    const [schedules] = await pool.execute(query, params);

    // Format the date/time for the frontend if needed, though MySQL datetime should be fine
    const formattedSchedules = schedules.map(schedule => {
      // If the date is a MySQL DATETIME string, it's usually already in a compatible format
      // If it's a Date object from the driver, .toISOString() is good.
      // Let's assume it's a string from MySQL and just return it, or convert if necessary.
      return {
        ...schedule,
        date: schedule.date ? new Date(schedule.date).toISOString() : null,
      };
    });

    res.json({ schedule: formattedSchedules });
  } catch (error) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({ error: { code: 500, message: "Internal server error" } });
  }
};

// GET /jobseeker/api/notifications
const getNotifications = async (req, res) => {
  try {
    const { date, readStatus, type } = req.query;
    let query = "SELECT * FROM notifications WHERE user_id = ?";
    const params = [req.user.id];

    if (date) {
      query += " AND DATE(created_at) = ?";
      params.push(date);
    }
    if (readStatus !== undefined) {
      query += " AND is_read = ?";
      params.push(readStatus === 'true' ? 1 : 0);
    }
    if (type) {
      query += " AND type = ?";
      params.push(type);
    }

    const [notifications] = await pool.execute(query, params);

    // Get unread count separately
    const [unreadCountResult] = await pool.execute(
      "SELECT COUNT(*) AS unreadCount FROM notifications WHERE user_id = ? AND is_read = FALSE",
      [req.user.id]
    );
    const unreadCount = unreadCountResult[0].unreadCount;

    res.json({ notifications: notifications, unreadCount: unreadCount });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: { code: 500, message: "Internal server error" } });
  }
};

// PATCH /jobseeker/api/notifications/:id
const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const { read } = req.body; // Expecting { "read": true/false }

    if (read === undefined || typeof read !== 'boolean') {
      return res.status(400).json({ error: { code: 400, message: "'read' status is required and must be a boolean." } });
    }

    const [result] = await pool.execute(
      "UPDATE notifications SET is_read = ? WHERE notification_id = ? AND user_id = ?",
      [read ? 1 : 0, id, req.user.id] // Store as 1 or 0 for tinyint
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: { code: 404, message: "Notification not found or does not belong to user" } });
    }

    res.json({ message: "Notification status updated successfully.", notificationId: id, readStatus: read });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: { code: 500, message: "Internal server error" } });
  }
};

// PUT /jobseeker/api/notifications/mark-all-read (Changed from PATCH to PUT)
const markAllNotificationsRead = async (req, res) => {
  try {
    await pool.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = ?", [req.user.id]);
    res.json({ message: `All notifications marked as read for jobseeker '${req.user.id}'.` });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: { code: 500, message: "Internal server error" } });
  }
};

// DELETE /jobseeker/api/notifications/:id
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      "DELETE FROM notifications WHERE notification_id = ? AND user_id = ?",
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: { code: 404, message: "Notification not found or does not belong to user" } });
    }

    res.json({ message: "Notification deleted successfully.", notificationId: id });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: { code: 500, message: "Internal server error" } });
  }
};

// GET /jobseeker/api/notifications/upcoming
const getUpcomingNotifications = async (req, res) => {
  try {
    // Get notifications for the next 7 days that are unread
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const [upcomingNotifications] = await pool.execute(
      "SELECT * FROM notifications WHERE user_id = ? AND is_read = FALSE AND created_at <= ? ORDER BY created_at ASC",
      [req.user.id, sevenDaysFromNow.toISOString().slice(0, 19).replace('T', ' ')]
    );

    res.json({ upcomingNotifications: upcomingNotifications });
  } catch (error) {
    console.error("Error fetching upcoming notifications:", error);
    res.status(500).json({ error: { code: 500, message: "Internal server error" } });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getJobs,
  getAppliedJobs,
  applyJob,
  getSchedule,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  uploadResume,
  getResume,
  getJobById,
  deleteNotification,
  getUpcomingNotifications,
  upload,
}; 