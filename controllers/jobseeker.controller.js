const { pool } = require("../config/db");
const validator = require("validator");
const path = require("path");
const fs = require("fs");
const { findJobseekerProfileByUserId, updateJobseekerResumePath, updateJobseekerProfile, getJobseekerResumePathByUserId, findJobs, findJobById, findAppliedJobs, checkJobExists, findExistingApplication, createJobApplication, findScheduleByUserId, findNotificationsByUserId, countUnreadNotifications, updateNotificationReadStatus, markAllNotificationsRead: markAllNotificationsReadHelper, deleteNotificationById, findUpcomingNotifications } = require("../utils/dbHelpers");
const { upload } = require("../utils/multerConfig");

// Multer error handler middleware
function multerErrorHandler(err, req, res, next) {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: { code: 400, message: "File size exceeds limit (5MB)." } });
  }
  if (err && err.message && err.message.startsWith("Invalid file type")) {
    return res.status(400).json({ error: { code: 400, message: err.message } });
  }
  next(err);
}

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

    const newResumeFilename = req.file.filename;
    const newResume_filepath = `/uploads/resumes/${newResumeFilename}`;

    // Get the old resume path to delete it if it exists
    const oldResume_filepath = await getJobseekerResumePathByUserId(req.user.id);

    // Update the jobseeker's resume_filepath in the database
    await updateJobseekerResumePath(req.user.id, newResume_filepath);

    // If an old resume existed, delete it from the filesystem after successful database update
    if (oldResume_filepath) {
      const oldFilePath = path.join(__dirname, "..", oldResume_filepath);
      if (fs.existsSync(oldFilePath)) {
        fs.unlink(oldFilePath, (err) => {
          if (err) console.error("Error deleting old resume file:", err);
        });
      }
    }

    res.json({ message: "Resume uploaded successfully.", resumeUrl: newResume_filepath });
  } catch (error) {
    console.error("Error uploading resume:", error);
    res.status(500).json({ error: { code: 500, message: "Failed to upload resume. Please try again." } });
  }
};

// GET /jobseeker/api/profile/resume
const getResume = async (req, res) => {
  try {
    const resumeRelativePath = await getJobseekerResumePathByUserId(req.user.id);
    console.log('Debug: getResume - Retrieved resumeRelativePath from DB:', resumeRelativePath);

    if (!resumeRelativePath) {
      console.log('Debug: getResume - No resumeRelativePath found for user_id:', req.user.id);
      return res.status(404).json({ error: { code: 404, message: "Resume not found for this jobseeker." } });
    }

    let filePath;
    const expectedResumeSubdirPath = path.join(__dirname, "..", "uploads", "resumes", path.basename(resumeRelativePath));
    const oldResumeRootPath = path.join(__dirname, "..", "uploads", path.basename(resumeRelativePath));

    if (fs.existsSync(expectedResumeSubdirPath)) {
      filePath = expectedResumeSubdirPath;
    } else if (fs.existsSync(oldResumeRootPath)) {
      filePath = oldResumeRootPath;
    } else {
      console.error(`Resume file not found in either expected path: ${expectedResumeSubdirPath} or ${oldResumeRootPath}`);
      return res.status(404).json({ error: { code: 404, message: "Resume file not found on server." } });
    }

    console.log('Debug: getResume - Constructed filePath:', filePath);

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
    let { q, experienceLevel, location, datePosted, isUrgent, page = 1, limit = 10, minSalary, maxSalary, employmentType } = req.query;

    // Pass all query parameters to the centralized helper function
    const { jobs, totalJobs, totalPages, currentPage } = await findJobs({ 
      q, 
      experienceLevel, 
      location, 
      datePosted, 
      isUrgent, 
      page, 
      limit, 
      minSalary, 
      maxSalary, 
      employmentType 
    });

    res.json({
      jobs: jobs,
      pagination: {
        currentPage: currentPage,
        totalPages: totalPages,
        totalJobs: totalJobs,
        limit: limit, // Use the resolved limit from the helper
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

    const jobId = parseInt(id, 10); // Parse to integer
    if (isNaN(jobId)) {
      return res.status(400).json({ error: { code: 400, message: "Invalid Job ID format. Must be a number." } });
    }

    // Use the helper function to fetch the job
    const job = await findJobById(jobId); // Use findJobById

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
    const jobseekerId = req.user.id;

    // Validate status parameter if provided
    const allowedStatuses = ['Applied', 'Reviewed', 'Interviewed', 'Rejected', 'Hired']; // Define your allowed statuses
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: { code: 400, message: `Invalid status parameter. Allowed values are: ${allowedStatuses.join(', ')}.` } });
    }

    const appliedJobs = await findAppliedJobs(jobseekerId, status);
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
    // Check if the job exists using the helper function
    const jobExists = await checkJobExists(job_id);
    if (!jobExists) {
      return res.status(404).json({ error: { code: 404, message: "Job not found." } });
    }

    // Get the jobseeker's current resume filepath
    const jobseekerResumePath = await getJobseekerResumePathByUserId(req.user.id);

    // Optional: Enforce resume requirement for applying
    if (!jobseekerResumePath) {
      return res.status(400).json({ error: { code: 400, message: "Please upload your resume before applying for a job." } });
    }

    // Check if already applied using the helper function
    const alreadyApplied = await findExistingApplication(job_id, req.user.id);
    if (alreadyApplied) {
      return res.status(409).json({ error: { code: 409, message: "You have already applied for this job." } });
    }

    // Insert new application using the helper function
    const applicationId = await createJobApplication(job_id, req.user.id, jobseekerResumePath, "Applied");

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
    const userId = req.user.id;

    // Validate date parameters if provided
    if (startDate && !validator.isISO8601(startDate)) {
      return res.status(400).json({ error: { code: 400, message: "Invalid startDate format. Expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ." } });
    }
    if (endDate && !validator.isISO8601(endDate)) {
      return res.status(400).json({ error: { code: 400, message: "Invalid endDate format. Expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ." } });
    }

    const schedules = await findScheduleByUserId(userId, startDate, endDate);

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
    const userId = req.user.id;

    // Validate date parameter if provided
    if (date && !validator.isISO8601(date)) {
      return res.status(400).json({ error: { code: 400, message: "Invalid date format. Expected YYYY-MM-DD." } });
    }

    // Validate type parameter if provided
    const allowedNotificationTypes = ['interview', 'application_status', 'announcement', 'system']; // Define your allowed types
    if (type && !allowedNotificationTypes.includes(type)) {
      return res.status(400).json({ error: { code: 400, message: `Invalid notification type. Allowed values are: ${allowedNotificationTypes.join(', ')}.` } });
    }

    const notifications = await findNotificationsByUserId(userId, date, readStatus, type);

    // Get unread count separately using the helper function
    const unreadCount = await countUnreadNotifications(userId);

    res.json({ notifications: notifications, unreadCount: unreadCount });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Internal server error" });
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

    const affectedRows = await updateNotificationReadStatus(id, req.user.id, read); // Use helper function

    if (affectedRows === 0) {
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
    const userId = req.user.id;
    const affectedRows = await markAllNotificationsReadHelper(userId); // Call the renamed helper
    res.json({ message: `All notifications marked as read for jobseeker '${userId}'.`, affectedRows });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ error: { code: 500, message: "Internal server error" } });
  }
};

// DELETE /jobseeker/api/notifications/:id
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const affectedRows = await deleteNotificationById(id, req.user.id); // Use helper function

    if (affectedRows === 0) {
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

    const upcomingNotifications = await findUpcomingNotifications(req.user.id, sevenDaysFromNow); // Use helper function

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
  multerErrorHandler,
};