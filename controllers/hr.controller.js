const { pool } = require("../config/db");
const validator = require("validator");
const { findUserByEmail, updateUser, findJobseekerProfileByUserId } = require("../utils/dbHelpers");

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

// HR Job Management Controllers
const createJob = async (req, res) => {
  try {
    const { title, description, requirements, location, salary_range, employment_type } = req.body;
    const hr_id = req.user.id;

    if (!title || !description || !requirements || !location || !employment_type) {
      return res.status(400).json({ error: "Missing required job details" });
    }

    const [result] = await pool.execute(
      `INSERT INTO jobs (title, description, requirements, location, salary_range, employment_type, posted_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description, requirements, location, salary_range || null, employment_type, hr_id]
    );

    res.status(201).json({ message: "Job created successfully", jobId: result.insertId });
  } catch (error) {
    console.error("Error creating job:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getAllJobs = async (req, res) => {
  try {
    const [jobs] = await pool.execute("SELECT * FROM jobs WHERE posted_by_user_id = ?", [req.user.id]);
    res.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getJobById = async (req, res) => {
  try {
    const { jobId } = req.params;
    const [jobs] = await pool.execute("SELECT * FROM jobs WHERE id = ? AND posted_by_user_id = ?", [jobId, req.user.id]);

    const job = jobs[0];
    if (!job) {
      return res.status(404).json({ error: "Job not found or you don't have permission to view it" });
    }
    res.json(job);
  } catch (error) {
    console.error("Error fetching job by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { title, description, requirements, location, salary_range, employment_type } = req.body;
    const hr_id = req.user.id;

    const [existingJob] = await pool.execute("SELECT id FROM jobs WHERE id = ? AND posted_by_user_id = ?", [jobId, hr_id]);
    if (existingJob.length === 0) {
      return res.status(404).json({ error: "Job not found or you don't have permission to update it" });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (requirements !== undefined) updates.requirements = requirements;
    if (location !== undefined) updates.location = location;
    if (salary_range !== undefined) updates.salary_range = salary_range;
    if (employment_type !== undefined) updates.employment_type = employment_type;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }

    const setClause = Object.keys(updates).map(key => `\`${key}\` = ?`).join(', ');
    const values = [...Object.values(updates), jobId, hr_id];

    await pool.execute(
      `UPDATE jobs SET ${setClause} WHERE id = ? AND posted_by_user_id = ?`,
      values
    );

    res.json({ message: "Job updated successfully" });
  } catch (error) {
    console.error("Error updating job:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const hr_id = req.user.id;

    const [result] = await pool.execute("DELETE FROM jobs WHERE id = ? AND posted_by_user_id = ?", [jobId, hr_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Job not found or you don't have permission to delete it" });
    }

    res.json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("Error deleting job:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// HR Job Application Management
const getAllApplications = async (req, res) => {
  try {
    const [applications] = await pool.execute(
      `SELECT ja.*, j.title as job_title, u.username as jobseeker_username, u.email as jobseeker_email
       FROM job_applications ja
       JOIN jobs j ON ja.job_id = j.id
       JOIN users u ON ja.jobseeker_id = u.id
       WHERE j.posted_by_user_id = ?`,
      [req.user.id]
    );
    res.json(applications);
  } catch (error) {
    console.error("Error fetching all applications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getApplicationById = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const [applications] = await pool.execute(
      `SELECT ja.*, j.title as job_title, u.username as jobseeker_username, u.email as jobseeker_email
       FROM job_applications ja
       JOIN jobs j ON ja.job_id = j.id
       JOIN users u ON ja.jobseeker_id = u.id
       WHERE ja.application_id = ? AND j.posted_by_user_id = ?`,
      [applicationId, req.user.id]
    );

    const application = applications[0];
    if (!application) {
      return res.status(404).json({ error: "Application not found or you don't have permission to view it" });
    }
    res.json(application);
  } catch (error) {
    console.error("Error fetching application by ID:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, feedback } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Missing required status" });
    }

    const [existingApplication] = await pool.execute(
      `SELECT ja.application_id, j.posted_by_user_id 
       FROM job_applications ja
       JOIN jobs j ON ja.job_id = j.id
       WHERE ja.application_id = ? AND j.posted_by_user_id = ?`,
      [applicationId, req.user.id]
    );

    if (existingApplication.length === 0) {
      return res.status(404).json({ error: "Application not found or you don't have permission to update it" });
    }

    const updates = { status };
    if (feedback !== undefined) {
      updates.feedback = feedback;
    }

    const setClause = Object.keys(updates).map(key => `\`${key}\` = ?`).join(', ');
    const values = [...Object.values(updates), applicationId];

    await pool.execute(
      `UPDATE job_applications SET ${setClause} WHERE application_id = ?`,
      values
    );

    // Potentially send a notification to the jobseeker about the status change
    // This can be implemented here or as a separate utility/event.

    res.json({ message: "Application status updated successfully" });
  } catch (error) {
    console.error("Error updating application status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// HR Jobseeker Profile Viewing
const getJobseekerProfile = async (req, res) => {
  try {
    const { jobseekerId } = req.params;
    const profile = await findJobseekerProfileByUserId(jobseekerId);

    if (!profile) {
      return res.status(404).json({ error: "Jobseeker profile not found." });
    }
    // Ensure HR can only view profiles related to jobs they manage or for applications they are processing
    // For now, assuming HR can view any jobseeker profile for simplicity, but this can be refined later.
    res.json(profile);
  } catch (error) {
    console.error("Error fetching jobseeker profile for HR:", error);
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
  createJob,
  getAllJobs,
  getJobById,
  updateJob,
  deleteJob,
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,
  getJobseekerProfile,
}; 