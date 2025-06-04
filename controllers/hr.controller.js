const { loadJSON, saveJSON, updateIds } = require("../utils/fileHelpers");
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

    // Currently, HR profiles are assumed to be stored primarily in the users table.
    // If there's a separate 'hr_profiles' table with more fields, it would be joined here.
    res.json(user);
  } catch (error) {
    console.error("Error fetching HR profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { username } = req.body; // Assuming only username is updatable for now
    const errors = [];

    if (username !== undefined && (typeof username !== 'string' || username.trim().length === 0 || username.length > 255)) {
      errors.push("Username must be a non-empty string and less than 255 characters.");
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const user = await findUserByEmail(req.user.email);

    if (!user) {
      return res.status(404).json({ error: "HR profile not found" });
    }

    // Only update allowed fields
    const updates = {};
    if (username !== undefined) {
      updates.username = username;
    }

    if (Object.keys(updates).length > 0) {
      await updateUser(user.id, updates);
    }

    // Fetch the updated profile to send back in the response
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
      "SELECT * FROM interviews WHERE hr_id = ?", // Assuming hr_id is in interviews table
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
const scheduleInterview = (req, res) => {
  const { applicationId } = req.params;
  const { interviewDate, interviewTime, interviewLocation, notes } = req.body;

  if (!interviewDate || !interviewTime || !interviewLocation) {
    return res.status(400).json({ error: "Missing required interview details (date, time, location)" });
  }

  let jobs = loadJSON("jobs.json");
  let schedules = loadJSON("schedules.json");
  let notifications = loadJSON("notifications.json");
  const users = loadJSON("users.json");

  let jobFound = null;
  let applicationFound = null;
  let jobIndex = -1;
  let applicationIndex = -1;

  // Find the application and the job it belongs to
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const appIndex = job.applications.findIndex(app => app.applicationId === parseInt(applicationId, 10));
    if (appIndex !== -1) {
      jobFound = job;
      jobIndex = i;
      applicationFound = job.applications[appIndex];
      applicationIndex = appIndex;
      break;
    }
  }

  if (!jobFound || !applicationFound) {
    return res.status(404).json({ error: "Application not found" });
  }

  const jobseekerEmail = applicationFound.jobseekerEmail;
  const hrEmail = req.user.email;

  const jobseekerUser = users.find(u => u.email === jobseekerEmail);
  const hrUser = users.find(u => u.email === hrEmail);

  if (!jobseekerUser || !hrUser) {
      console.error("User data not found for scheduling interview.", { jobseekerEmail, hrEmail });
      return res.status(500).json({ error: "Internal server error: User data missing." });
  }

  // Generate unique IDs for new schedule and notification entries
  const hrScheduleId = updateIds("scheduleId"); // Assuming 'scheduleId' counter exists in meta.json
  const jobseekerScheduleId = updateIds("scheduleId");
  const hrNotificationId = updateIds("notificationId"); // Assuming 'notificationId' counter exists
  const jobseekerNotificationId = updateIds("notificationId");

  const interviewDetails = {
    date: interviewDate,
    time: interviewTime,
    location: interviewLocation,
    notes: notes || ""
  };

  // Create schedule for HR
  const hrSchedule = {
    id: hrScheduleId,
    email: hrEmail,
    role: 'hr',
    type: 'interview',
    title: `Interview with ${jobseekerUser.name} for ${jobFound.title}`,
    description: `Interview for job application ${applicationId}`,
    ...interviewDetails,
    jobId: jobFound.job_id,
    applicationId: parseInt(applicationId, 10),
    participantEmail: jobseekerEmail,
  };
  schedules.push(hrSchedule);

  // Create schedule for Jobseeker
  const jobseekerSchedule = {
    id: jobseekerScheduleId,
    email: jobseekerEmail,
    role: 'jobseeker',
    type: 'interview',
    title: `Interview for ${jobFound.title}`,
    description: `Your interview for job application ${applicationId}`,
    ...interviewDetails,
    jobId: jobFound.job_id,
    applicationId: parseInt(applicationId, 10),
    participantEmail: hrEmail,
  };
  schedules.push(jobseekerSchedule);

  // Create notification for HR
  const hrNotification = {
    id: hrNotificationId,
    email: hrEmail,
    role: 'hr',
    type: 'interview',
    title: `Interview Scheduled for ${jobseekerUser.name}`,
    message: `An interview has been scheduled for application ${applicationId} for the job ${jobFound.title}.`,
    read: false,
    createdAt: new Date().toISOString(),
    relatedJobId: jobFound.job_id,
    relatedApplicationId: parseInt(applicationId, 10),
    relatedUserEmail: jobseekerEmail,
  };
  notifications.push(hrNotification);

  // Create notification for Jobseeker
  const jobseekerNotification = {
    id: jobseekerNotificationId,
    email: jobseekerEmail,
    role: 'jobseeker',
    type: 'interview',
    title: `Interview Scheduled for Your Application`,
    message: `Your interview for the job ${jobFound.title} (Application ID: ${applicationId}) has been scheduled. Check your schedule for details.`, // Could add link here
    read: false,
    createdAt: new Date().toISOString(),
    relatedJobId: jobFound.job_id,
    relatedApplicationId: parseInt(applicationId, 10),
    relatedUserEmail: hrEmail,
  };
  notifications.push(jobseekerNotification);

  // Update application status and add interview details
  jobs[jobIndex].applications[applicationIndex].status = 'Interview Scheduled';
  jobs[jobIndex].applications[applicationIndex].interviewDetails = interviewDetails;

  // Save updated data
  saveJSON("jobs.json", jobs);
  saveJSON("schedules.json", schedules);
  saveJSON("notifications.json", notifications);

  res.status(200).json({ message: "Interview scheduled successfully", hrSchedule, jobseekerSchedule, hrNotification, jobseekerNotification });
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