const { pool } = require("../config/db");
const validator = require("validator");

// GET /jobseeker/api/profile
const getProfile = async (req, res) => {
  try {
    const [users] = await pool.execute(
      "SELECT id, username, email, role, verified, voat_id FROM users WHERE id = ?",
      [req.user.id]
    );
    const user = users[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const [jobseekers] = await pool.execute(
      "SELECT bio, portfolio, education, experience_years, skills, projects, certifications, resume_filepath FROM jobseeker WHERE user_id = ?",
      [req.user.id]
    );
    const jobseeker = jobseekers[0];

    const profile = {
      ...user,
      ...(jobseeker || {}),
    };

    res.json(profile);
  } catch (error) {
    console.error("Error fetching job seeker profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PUT /jobseeker/api/profile
const updateProfile = async (req, res) => {
  try {
    const { bio, portfolio, education, experience_years, skills, projects, certifications, resume_filepath } = req.body;
    const errors = [];

    // Input validation
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
    if (skills !== undefined && (typeof skills !== 'string' || skills.length > 500)) {
      errors.push("Skills must be a comma-separated string and less than 500 characters.");
    }
    // For JSON fields (projects, certifications), we need to ensure they are valid JSON strings or objects
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
      return res.status(400).json({ errors });
    }

    // Check if a jobseeker profile already exists
    const [existingProfile] = await pool.execute("SELECT user_id FROM jobseeker WHERE user_id = ?", [req.user.id]);

    if (existingProfile.length === 0) {
      // If no profile exists, insert a new one
      await pool.execute(
        `INSERT INTO jobseeker (user_id, bio, portfolio, education, experience_years, skills, projects, certifications, resume_filepath)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [req.user.id, bio, portfolio, education, experience_years, skills, JSON.stringify(parsedProjects), JSON.stringify(parsedCertifications), resume_filepath]
      );
    } else {
      // If profile exists, update it
      await pool.execute(
        `UPDATE jobseeker SET
         bio = ?, portfolio = ?, education = ?, experience_years = ?, skills = ?, projects = ?, certifications = ?, resume_filepath = ?
         WHERE user_id = ?`, 
        [bio, portfolio, education, experience_years, skills, JSON.stringify(parsedProjects), JSON.stringify(parsedCertifications), resume_filepath, req.user.id]
      );
    }

    // Fetch the updated profile to send back in the response
    const [updatedUsers] = await pool.execute(
      "SELECT id, username, email, role, verified, voat_id FROM users WHERE id = ?",
      [req.user.id]
    );
    const updatedUser = updatedUsers[0];

    const [updatedJobseekers] = await pool.execute(
      "SELECT bio, portfolio, education, experience_years, skills, projects, certifications, resume_filepath FROM jobseeker WHERE user_id = ?",
      [req.user.id]
    );
    const updatedJobseeker = updatedJobseekers[0];

    const updatedProfile = {
      ...updatedUser,
      ...(updatedJobseeker || {}),
    };

    res.json({ message: "Profile updated successfully", profile: updatedProfile });
  } catch (error) {
    console.error("Error updating job seeker profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /jobseeker/api/jobs
const getJobs = async (req, res) => {
  try {
    const [jobs] = await pool.execute("SELECT * FROM jobs");
    res.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /jobseeker/api/jobs/applied
const getAppliedJobs = async (req, res) => {
  try {
    const [appliedJobs] = await pool.execute(
      `SELECT j.* FROM jobs j
       JOIN job_applications ja ON j.id = ja.job_id
       WHERE ja.jobseeker_id = ?`,
      [req.user.id]
    );
    res.json(appliedJobs);
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
    // Check if already applied
    const [existingApplication] = await pool.execute(
      "SELECT application_id FROM job_applications WHERE job_id = ? AND jobseeker_id = ?",
      [job_id, req.user.id]
    );

    if (existingApplication.length > 0) {
      return res.status(400).json({ error: "Already applied to this job" });
    }

    await pool.execute(
      "INSERT INTO job_applications (job_id, jobseeker_id) VALUES (?, ?)",
      [job_id, req.user.id]
    );
    res.json({ message: "Application submitted successfully" });
  } catch (error) {
    console.error("Error submitting application:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /jobseeker/api/schedule
const getSchedule = async (req, res) => {
  try {
    const [schedules] = await pool.execute(
      "SELECT * FROM interviews WHERE application_id IN (SELECT application_id FROM job_applications WHERE jobseeker_id = ?)",
      [req.user.id]
    );
    res.json(schedules);
  } catch (error) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /jobseeker/api/notifications
const getNotifications = async (req, res) => {
  try {
    const { date } = req.query;
    let query = "SELECT * FROM notifications WHERE user_id = ?";
    const params = [req.user.id];

    if (date) {
      query += " AND DATE(created_at) = ?";
      params.push(date);
    }

    const [notifications] = await pool.execute(query, params);
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PATCH /jobseeker/api/notifications/:id
const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      "UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?",
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Notification not found or does not belong to user" });
    }

    res.json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// PATCH /jobseeker/api/notifications/mark-all-read
const markAllNotificationsRead = async (req, res) => {
  try {
    await pool.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = ?", [req.user.id]);
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: "Internal server error" });
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
  markAllNotificationsRead
}; 