const { pool } = require("../config/db");
const validator = require("validator");
const { findUserByEmail, updateUser } = require("../utils/dbHelpers");

// HR Profile Management Controllers
const getProfile = async (req, res) => {
  try {
    const [users] = await pool.execute(
      "SELECT id, username, email, role, verified, voat_id FROM users WHERE id = ?",
      [req.user.id]
    );
    const user = users[0];

    if (!user) {
      return res.status(404).json({ error: "HR profile not found" });
    }

    // HR profiles are assumed to be stored primarily in the users table.
    res.json(user);
  } catch (error) {
    console.error("Error fetching HR profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { username, voat_id } = req.body; // Including voat_id as an updatable field
    const errors = [];

    if (username !== undefined && (typeof username !== 'string' || username.trim().length === 0 || username.length > 255)) {
      errors.push("Username must be a non-empty string and less than 255 characters.");
    }
    // Add validation for voat_id if needed, e.g., format or uniqueness
    if (voat_id !== undefined && (typeof voat_id !== 'string' || voat_id.trim().length === 0 || voat_id.length > 50)) { // Example validation
      errors.push("VOAT ID must be a non-empty string and less than 50 characters.");
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const user = await findUserByEmail(req.user.email);

    if (!user) {
      return res.status(404).json({ error: "HR profile not found" });
    }

    const updates = {};
    if (username !== undefined) {
      updates.username = username;
    }
    if (voat_id !== undefined) {
      updates.voat_id = voat_id;
    }

    if (Object.keys(updates).length > 0) {
      await updateUser(user.id, updates);
    }

    const [updatedUsers] = await pool.execute(
      "SELECT id, username, email, role, verified, voat_id FROM users WHERE id = ?",
      [req.user.id]
    );
    const updatedUser = updatedUsers[0];

    res.json({ message: "HR profile updated successfully", profile: updatedUser });
  } catch (error) {
    console.error("Error updating HR profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// HR Schedule Controllers
const getSchedule = async (req, res) => {
  try {
    const [schedules] = await pool.execute(
      "SELECT * FROM interviews WHERE interviewer_id = ?",
      [req.user.id]
    );
    res.json(schedules);
  } catch (error) {
    console.error("Error fetching HR schedule:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// HR Notification Controllers
const getNotifications = async (req, res) => {
  try {
    const { date } = req.query;
    let query = "SELECT * FROM notifications WHERE user_id = ? AND role = 'hr'";
    const params = [req.user.id];

    if (date) {
      query += " AND DATE(created_at) = ?";
      params.push(date);
    }

    const [notifications] = await pool.execute(query, params);
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching HR notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute(
      "UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ? AND role = 'hr'",
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Notification not found or does not belong to this HR" });
    }

    res.json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    await pool.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND role = 'hr'", [req.user.id]);
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// HR Application Management & Interview Scheduling Controllers
const scheduleInterview = async (req, res) => {
  const { applicationId } = req.params;
  const { interviewDate, interviewTime, interviewLocation, notes } = req.body;

  if (!applicationId || !interviewDate || !interviewTime || !interviewLocation) {
    return res.status(400).json({ error: "Missing required interview details (applicationId, date, time, location)" });
  }

  try {
    // 1. Find the application and its associated job and jobseeker
    const [applications] = await pool.execute(
      `SELECT ja.application_id, ja.job_id, ja.jobseeker_id, j.title AS job_title
       FROM job_applications ja
       JOIN jobs j ON ja.job_id = j.id
       WHERE ja.application_id = ?`, 
      [applicationId]
    );

    const application = applications[0];

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    // Check if HR user is authorized to schedule for this job (e.g., if job belongs to this HR)
    // This requires a `hr_id` in the `jobs` table or a job-hr association table.
    // For now, assuming HR can schedule for any job applications.
    const [hrUser] = await pool.execute("SELECT id, username, email, role FROM users WHERE id = ?", [req.user.id]);
    const [jobseekerUser] = await pool.execute("SELECT id, username, email, role FROM users WHERE id = ?", [application.jobseeker_id]);

    if (!hrUser[0] || !jobseekerUser[0]) {
      console.error("User data not found for scheduling interview.", { hrId: req.user.id, jobseekerId: application.jobseeker_id });
      return res.status(500).json({ error: "Internal server error: User data missing." });
    }

    // 2. Insert into interviews table
    const [interviewResult] = await pool.execute(
      `INSERT INTO interviews (application_id, interviewer_id, jobseeker_id, interview_date, interview_time, interview_location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, 
      [application.application_id, req.user.id, application.jobseeker_id, interviewDate, interviewTime, interviewLocation, notes || ""]
    );
    const interviewId = interviewResult.insertId;

    // 3. Create notifications for HR and Jobseeker
    const now = new Date();

    // Notification for HR
    await pool.execute(
      `INSERT INTO notifications (user_id, role, type, title, message, is_read, created_at, related_job_id, related_application_id, related_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [
        req.user.id,
        'hr',
        'interview',
        `Interview Scheduled for ${jobseekerUser[0].username}`,
        `An interview has been scheduled for application ${application.application_id} for the job ${application.job_title}.`,
        false,
        now,
        application.job_id,
        application.application_id,
        application.jobseeker_id
      ]
    );

    // Notification for Jobseeker
    await pool.execute(
      `INSERT INTO notifications (user_id, role, type, title, message, is_read, created_at, related_job_id, related_application_id, related_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [
        application.jobseeker_id,
        'jobseeker',
        'interview',
        `Interview Scheduled for Your Application`,
        `Your interview for the job ${application.job_title} (Application ID: ${application.application_id}) has been scheduled. Check your schedule for details.`,
        false,
        now,
        application.job_id,
        application.application_id,
        req.user.id
      ]
    );

    // 4. Update application status (if `job_applications` table has a status field)
    await pool.execute(
      `UPDATE job_applications SET status = ?, interview_details = ? WHERE application_id = ?`, 
      ['Interview Scheduled', JSON.stringify({ interviewDate, interviewTime, interviewLocation, notes }), application.application_id]
    );

    res.status(200).json({ message: "Interview scheduled successfully", interviewId, application });
  } catch (error) {
    console.error("Error scheduling interview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getSchedule,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  scheduleInterview,
}; 