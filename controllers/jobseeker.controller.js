const { pool } = require("../config/db");

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

    // Check if a jobseeker profile already exists
    const [existingProfile] = await pool.execute("SELECT user_id FROM jobseeker WHERE user_id = ?", [req.user.id]);

    if (existingProfile.length === 0) {
      // If no profile exists, insert a new one
      await pool.execute(
        `INSERT INTO jobseeker (user_id, bio, portfolio, education, experience_years, skills, projects, certifications, resume_filepath)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [req.user.id, bio, portfolio, education, experience_years, skills, JSON.stringify(projects), JSON.stringify(certifications), resume_filepath]
      );
    } else {
      // If profile exists, update it
      await pool.execute(
        `UPDATE jobseeker SET
         bio = ?, portfolio = ?, education = ?, experience_years = ?, skills = ?, projects = ?, certifications = ?, resume_filepath = ?
         WHERE user_id = ?`, 
        [bio, portfolio, education, experience_years, skills, JSON.stringify(projects), JSON.stringify(certifications), resume_filepath, req.user.id]
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