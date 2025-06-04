const { pool } = require("../config/db");
const validator = require("validator");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

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
    const [users] = await pool.execute(
      "SELECT id, username, email, role, verified, voat_id, name, phone, gender, address, whatsapp FROM users WHERE id = ?",
      [req.user.id]
    );
    const user = users[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const [jobseekers] = await pool.execute(
      "SELECT bio, portfolio, education, experience_years, skills, projects, certifications, resume_filepath, parent_name, parent_phone, parent_relation, parent_email FROM jobseeker WHERE user_id = ?",
      [req.user.id]
    );
    const jobseeker = jobseekers[0];

    const profile = {
      jobseekerId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      address: user.address,
      skills: jobseeker && jobseeker.skills ? jobseeker.skills.split(',').map(s => s.trim()) : [],
      whatsapp: user.whatsapp,
      parentDetails: {
        name: jobseeker ? jobseeker.parent_name : null,
        phone: jobseeker ? jobseeker.parent_phone : null,
        relation: jobseeker ? jobseeker.parent_relation : null,
        email: jobseeker ? jobseeker.parent_email : null,
      },
      resumeUrl: jobseeker ? jobseeker.resume_filepath : null,
      bio: jobseeker ? jobseeker.bio : null,
      portfolio: jobseeker ? jobseeker.portfolio : null,
      education: jobseeker ? jobseeker.education : null,
      experience_years: jobseeker ? jobseeker.experience_years : null,
      projects: jobseeker && jobseeker.projects ? JSON.parse(jobseeker.projects) : null,
      certifications: jobseeker && jobseeker.certifications ? JSON.parse(jobseeker.certifications) : null,
    };

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

    // Update the jobseeker's resume_filepath in the database
    await pool.execute(
      "UPDATE jobseeker SET resume_filepath = ? WHERE user_id = ?",
      [resume_filepath, req.user.id]
    );

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
    const {
      name, phone, gender, address, whatsapp,
      parentDetails,
      bio, portfolio, education, experience_years, skills, projects, certifications, resume_filepath
    } = req.body;

    const errors = [];

    // --- Validation for user fields (excluding parentDetails) ---
    if (name !== undefined && (typeof name !== 'string' || name.length > 255)) {
      errors.push("Name must be a string and less than 255 characters.");
    }
    if (phone !== undefined && (typeof phone !== 'string' || !validator.isMobilePhone(phone, 'any'))) {
      errors.push("Phone must be a valid mobile number.");
    }
    if (gender !== undefined && (typeof gender !== 'string' || !['Male', 'Female', 'Other'].includes(gender))) {
      errors.push("Gender must be 'Male', 'Female', or 'Other'.");
    }
    if (address !== undefined && (typeof address !== 'string' || address.length > 1000)) {
      errors.push("Address must be a string and less than 1000 characters.");
    }
    if (whatsapp !== undefined && (typeof whatsapp !== 'string' || !validator.isMobilePhone(whatsapp, 'any'))) {
      errors.push("Whatsapp must be a valid mobile number.");
    }

    // --- Validation for parentDetails (now in jobseeker table) ---
    let parentName = null;
    let parentPhone = null;
    let parentRelation = null;
    let parentEmail = null;

    if (parentDetails !== undefined) {
      if (typeof parentDetails !== 'object' || parentDetails === null) {
        errors.push("Parent details must be an object.");
      } else {
        if (parentDetails.name !== undefined) {
          if (typeof parentDetails.name !== 'string' || parentDetails.name.length > 255) {
            errors.push("Parent name must be a string and less than 255 characters.");
          }
          parentName = parentDetails.name;
        }
        if (parentDetails.phone !== undefined) {
          if (typeof parentDetails.phone !== 'string' || !validator.isMobilePhone(parentDetails.phone, 'any')) {
            errors.push("Parent phone must be a valid mobile number.");
          }
          parentPhone = parentDetails.phone;
        }
        if (parentDetails.relation !== undefined) {
          if (typeof parentDetails.relation !== 'string' || parentDetails.relation.length > 50) {
            errors.push("Parent relation must be a string and less than 50 characters.");
          }
          parentRelation = parentDetails.relation;
        }
        if (parentDetails.email !== undefined) {
          if (typeof parentDetails.email !== 'string' || !validator.isEmail(parentDetails.email)) {
            errors.push("Parent email must be a valid email address.");
          }
          parentEmail = parentDetails.email;
        }
      }
    }

    if (bio !== undefined && (typeof bio !== 'string' || bio.length > 1000)) {
      errors.push("Bio must be a string and less than 1000 characters.");
    }
    if (portfolio !== undefined && (typeof portfolio !== 'string' || !validator.isURL(portfolio) || portfolio.length > 255)) {
      errors.push("Portfolio must be a valid URL and less than 255 characters.");
    }
    if (education !== undefined && (typeof education !== 'string' || education.length > 1000)) {
      errors.push("Education must be a string and less than 1000 characters.");
    }
    if (experience_years !== undefined && (typeof experience_years !== 'number' || experience_years < 0 || experience_years > 99)) {
      errors.push("Experience years must be a non-negative number and less than 100.");
    }

    let skillsToStore = null;
    if (skills !== undefined) {
      if (!Array.isArray(skills)) {
        errors.push("Skills must be an array of strings.");
      } else {
        if (skills.some(s => typeof s !== 'string' || s.length > 50)) {
          errors.push("Each skill in the array must be a string and less than 50 characters.");
        }
        skillsToStore = skills.join(', ');
        if (skillsToStore.length > 500) {
          errors.push("Combined skills string exceeds 500 characters.");
        }
      }
    }

    let parsedProjects = null;
    if (projects !== undefined) {
      if (typeof projects === 'string') {
        try {
          parsedProjects = JSON.parse(projects);
        } catch (e) {
          errors.push("Projects must be a valid JSON string.");
        }
      } else if (typeof projects === 'object' && projects !== null) {
        parsedProjects = projects;
      } else {
        errors.push("Projects must be a valid JSON string or object.");
      }
    }

    let parsedCertifications = null;
    if (certifications !== undefined) {
      if (typeof certifications === 'string') {
        try {
          parsedCertifications = JSON.parse(certifications);
        } catch (e) {
          errors.push("Certifications must be a valid JSON string.");
        }
      } else if (typeof certifications === 'object' && certifications !== null) {
        parsedCertifications = certifications;
      } else {
        errors.push("Certifications must be a valid JSON string or object.");
      }
    }

    if (resume_filepath !== undefined && (typeof resume_filepath !== 'string' || resume_filepath.length > 255)) {
      errors.push("Resume filepath must be a string and less than 255 characters.");
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors: errors.map(msg => ({ message: msg })) });
    }

    // Update users table (only general user fields)
    let userUpdateQuery = `UPDATE users SET updated_at = CURRENT_TIMESTAMP`;
    const userUpdateParams = [];

    if (name !== undefined) { userUpdateQuery += `, name = ?`; userUpdateParams.push(name); }
    if (phone !== undefined) { userUpdateQuery += `, phone = ?`; userUpdateParams.push(phone); }
    if (gender !== undefined) { userUpdateQuery += `, gender = ?`; userUpdateParams.push(gender); }
    if (address !== undefined) { userUpdateQuery += `, address = ?`; userUpdateParams.push(address); }
    if (whatsapp !== undefined) { userUpdateQuery += `, whatsapp = ?`; userUpdateParams.push(whatsapp); }
    
    userUpdateQuery += ` WHERE id = ?`;
    userUpdateParams.push(req.user.id);
    
    if (userUpdateParams.length > 1) { // Only execute if there are fields to update (besides updated_at and id)
        await pool.execute(userUpdateQuery, userUpdateParams);
    }

    const [existingJobseekerProfile] = await pool.execute("SELECT user_id FROM jobseeker WHERE user_id = ?", [req.user.id]);

    // Prepare fields for jobseeker table (including parent details)
    const jobseekerFields = {};
    if (bio !== undefined) jobseekerFields.bio = bio;
    if (portfolio !== undefined) jobseekerFields.portfolio = portfolio;
    if (education !== undefined) jobseekerFields.education = education;
    if (experience_years !== undefined) jobseekerFields.experience_years = experience_years;
    if (skillsToStore !== null) jobseekerFields.skills = skillsToStore;
    if (parsedProjects !== null) jobseekerFields.projects = JSON.stringify(parsedProjects);
    if (parsedCertifications !== null) jobseekerFields.certifications = JSON.stringify(parsedCertifications);
    if (resume_filepath !== undefined) jobseekerFields.resume_filepath = resume_filepath;
    if (parentName !== null) jobseekerFields.parent_name = parentName;
    if (parentPhone !== null) jobseekerFields.parent_phone = parentPhone;
    if (parentRelation !== null) jobseekerFields.parent_relation = parentRelation;
    if (parentEmail !== null) jobseekerFields.parent_email = parentEmail;

    if (existingJobseekerProfile.length === 0) {
      // If no jobseeker profile exists, insert a new one
      if (Object.keys(jobseekerFields).length > 0) { // Only insert if there are jobseeker-specific fields to add
        const columns = Object.keys(jobseekerFields);
        const values = Object.values(jobseekerFields);
        await pool.execute(
          `INSERT INTO jobseeker (user_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
          [req.user.id, ...values]
        );
      }
    } else {
      // If jobseeker profile exists, update it
      if (Object.keys(jobseekerFields).length > 0) { // Only update if there are jobseeker-specific fields
        const setClauses = Object.keys(jobseekerFields).map(key => `${key} = ?`).join(', ');
        const updateValues = Object.values(jobseekerFields);
        await pool.execute(
          `UPDATE jobseeker SET ${setClauses} WHERE user_id = ?`,
          [...updateValues, req.user.id]
        );
      }
    }

    // Fetch the updated profile to send back in the response (re-using getProfile logic to ensure consistency)
    const [updatedUsersResult] = await pool.execute(
      "SELECT id, username, email, role, verified, voat_id, name, phone, gender, address, whatsapp FROM users WHERE id = ?",
      [req.user.id]
    );
    const updatedUser = updatedUsersResult[0];

    const [updatedJobseekersResult] = await pool.execute(
      "SELECT bio, portfolio, education, experience_years, skills, projects, certifications, resume_filepath, parent_name, parent_phone, parent_relation, parent_email FROM jobseeker WHERE user_id = ?",
      [req.user.id]
    );
    const updatedJobseeker = updatedJobseekersResult[0];

    const updatedProfile = {
      jobseekerId: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      gender: updatedUser.gender,
      address: updatedUser.address,
      skills: updatedJobseeker && updatedJobseeker.skills ? updatedJobseeker.skills.split(',').map(s => s.trim()) : [],
      whatsapp: updatedUser.whatsapp,
      parentDetails: {
        name: updatedJobseeker ? updatedJobseeker.parent_name : null,
        phone: updatedJobseeker ? updatedJobseeker.parent_phone : null,
        relation: updatedJobseeker ? updatedJobseeker.parent_relation : null,
        email: updatedJobseeker ? updatedJobseeker.parent_email : null,
      },
      resumeUrl: updatedJobseeker ? updatedJobseeker.resume_filepath : null,
      bio: updatedJobseeker ? updatedJobseeker.bio : null,
      portfolio: updatedJobseeker ? updatedJobseeker.portfolio : null,
      education: updatedJobseeker ? updatedJobseeker.education : null,
      experience_years: updatedJobseeker ? updatedJobseeker.experience_years : null,
      projects: updatedJobseeker && updatedJobseeker.projects ? JSON.parse(updatedJobseeker.projects) : null,
      certifications: updatedJobseeker && updatedJobseeker.certifications ? JSON.parse(updatedJobseeker.certifications) : null,
    };

    res.json({ message: "Profile updated successfully", updatedProfile: updatedProfile });
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