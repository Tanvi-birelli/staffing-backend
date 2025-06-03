const { pool } = require("../config/db");

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

    const { password, ...profile } = user;
    res.json(profile);
  } catch (error) {
    console.error("Error fetching HR profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { username, voat_id } = req.body; // Assuming these are the updatable fields for HR

    await pool.execute(
      "UPDATE users SET username = ?, voat_id = ? WHERE id = ?",
      [username, voat_id, req.user.id]
    );

    // Fetch the updated user profile
    const [updatedUsers] = await pool.execute(
      "SELECT id, username, email, role, verified, voat_id FROM users WHERE id = ?",
      [req.user.id]
    );
    const updatedUser = updatedUsers[0];

    const { password, ...profile } = updatedUser;
    res.json({ message: "HR profile updated successfully", profile });
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
    let query = "SELECT * FROM notifications WHERE user_id = ?";
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
      "UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?",
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
    await pool.execute("UPDATE notifications SET is_read = TRUE WHERE user_id = ?", [req.user.id]);
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// HR Application Management & Interview Scheduling Controllers
const scheduleInterview = async (req, res) => {
  const { applicationId } = req.params;
  const { interviewDate, interviewTime, interviewType, notes } = req.body;

  if (!interviewDate || !interviewTime || !interviewType) {
    return res.status(400).json({ error: "Missing required interview details (date, time, type)" });
  }

  try {
    // Find the application and the job it belongs to
    const [applications] = await pool.execute(
      "SELECT job_id, jobseeker_id FROM job_applications WHERE application_id = ?",
      [applicationId]
    );
    const application = applications[0];

    if (!application) {
      return res.status(404).json({ error: "Application not found" });
    }

    const [jobs] = await pool.execute("SELECT title, hr_id FROM jobs WHERE id = ?", [application.job_id]);
    const jobFound = jobs[0];

    if (!jobFound) {
      return res.status(404).json({ error: "Job not found for this application" });
    }

    // Verify the HR user (interviewer_id) matches the logged-in HR user
    if (jobFound.hr_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized: You can only schedule interviews for jobs you posted." });
    }

    // Insert interview into the interviews table
    const [interviewResult] = await pool.execute(
      `INSERT INTO interviews (application_id, interviewer_id, interview_date, interview_time, interview_type, notes)
       VALUES (?, ?, ?, ?, ?, ?)`, 
      [application.application_id, req.user.id, interviewDate, interviewTime, interviewType, notes]
    );
    const interviewId = interviewResult.insertId;

    // Update application status
    await pool.execute(
      "UPDATE job_applications SET status = ? WHERE application_id = ?",
      ['Interview Scheduled', applicationId]
    );

    // Create notification for HR
    await pool.execute(
      "INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)",
      [req.user.id, 'interview_scheduled', `Interview scheduled for application ${applicationId} for job ${jobFound.title}.`]
    );

    // Create notification for Jobseeker
    await pool.execute(
      "INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)",
      [application.jobseeker_id, 'interview_scheduled', `Your interview for job ${jobFound.title} has been scheduled. Application ID: ${applicationId}.`]
    );

    res.status(200).json({ message: "Interview scheduled successfully", interviewId });
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