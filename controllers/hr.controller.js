const { loadJSON, saveJSON, updateIds } = require("../utils/fileHelpers");

// HR Profile Management Controllers
const getProfile = (req, res) => {
  const users = loadJSON("users.json");
  const user = users.find(u => u.email === req.user.email);

  if (!user) {
    return res.status(404).json({ error: "HR profile not found" });
  }

  const { password, ...profile } = user;
  res.json(profile);
};

const updateProfile = (req, res) => {
  let users = loadJSON("users.json");
  const userIndex = users.findIndex(u => u.email === req.user.email);

  if (userIndex === -1) {
    return res.status(404).json({ error: "HR profile not found" });
  }

  const existingUser = users[userIndex];

  // Update allowed fields, preventing sensitive data changes like email or password directly
  const updatedUser = {
    ...existingUser,
    ...req.body,
    email: existingUser.email, // Prevent email change via profile update
    password: existingUser.password, // Prevent password change via profile update
    user_id: existingUser.user_id, // Ensure user_id is not changed
    // Add other fields that should not be changed here
  };

  users[userIndex] = updatedUser;
  saveJSON("users.json", users);

  const { password, ...profile } = updatedUser;
  res.json({ message: "HR profile updated successfully", profile });
};

// HR Schedule Controllers
const getSchedule = (req, res) => {
  const schedules = loadJSON("schedules.json");
  // Assuming schedule data is linked to HR by email, similar to jobseekers
  const hrSchedules = schedules.filter(s => s.hrEmail === req.user.email);
  res.json(hrSchedules || []);
};

// HR Notification Controllers
const getNotifications = (req, res) => {
  const notifications = loadJSON("notifications.json");
  const { date } = req.query; // Get the date query parameter

  let hrNotifications = notifications.filter(n => n.email === req.user.email && n.role === 'hr'); // Filter by HR email and role

  // If a date is provided, filter by date
  if (date) {
    hrNotifications = hrNotifications.filter(notif => {
      // Assuming notification objects have a 'createdAt' timestamp
      const notificationDate = new Date(notif.createdAt).toISOString().split('T')[0];
      return notificationDate === date;
    });
  }

  res.json(hrNotifications || []);
};

const markNotificationRead = (req, res) => {
  let notifications = loadJSON("notifications.json");
  const notificationId = parseInt(req.params.id, 10);

  const notification = notifications.find(n => n.id === notificationId && n.hrEmail === req.user.email);

  if (!notification) return res.status(404).json({ error: "Notification not found or does not belong to this HR" });

  notification.read = true;

  saveJSON("notifications.json", notifications);

  res.json({ message: "Notification marked as read" });
};

const markAllNotificationsRead = (req, res) => {
  let notifications = loadJSON("notifications.json");
  const updatedNotifications = notifications.map(notif => {
    // Assuming notifications are linked to HR by email
    if (notif.hrEmail === req.user.email) {
      return { ...notif, read: true };
    } else {
      return notif;
    }
  });

  saveJSON("notifications.json", updatedNotifications);

  res.json({ message: "All notifications marked as read" });
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