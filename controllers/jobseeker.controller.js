const { loadJSON, saveJSON } = require("../utils/fileHelpers");

// GET /jobseeker/api/profile
const getProfile = (req, res) => {
  const users = loadJSON("users.json");
  const jobseekers = loadJSON("jobseekers.json");

  const user = users.find(u => u.email === req.user.email);
  const jobseeker = jobseekers.find(j => j.email === req.user.email);

  if (!user || !jobseeker) return res.status(404).json({ error: "Profile not found" });

  const profile = {
    ...jobseeker,
    ...user,
    resume: jobseeker.resume || null, 
    experience: jobseeker.experience || [], 
  };

  res.json(profile);
};



// PUT /jobseeker/api/profile
const updateProfile = (req, res) => {
  let jobseekers = loadJSON("jobseekers.json");

  const jobseekerIndex = jobseekers.findIndex(j => j.email === req.user.email);

  if (jobseekerIndex === -1) {
     console.warn(`Profile not found for update for email: ${req.user.email}`);
     return res.status(404).json({ error: "Profile not found" });
  }

  const existingJobseeker = jobseekers[jobseekerIndex];

  const updatedJobseeker = {
    ...existingJobseeker,
    ...req.body,
    email: existingJobseeker.email, 
    password: existingJobseeker.password, 
    appliedJobs: existingJobseeker.appliedJobs, 
    user_id: existingJobseeker.user_id, 
    voat_id: existingJobseeker.voat_id, 
  };

  if (req.body.resume !== undefined) {
      updatedJobseeker.resume = req.body.resume;
  }

  jobseekers[jobseekerIndex] = updatedJobseeker;

  saveJSON("jobseekers.json", jobseekers);

  const { password, ...profileResponse } = updatedJobseeker;

  res.json({ message: "Profile updated successfully", profile: profileResponse });
};

// GET /jobseeker/api/jobs
const getJobs = (req, res) => {
  const jobs = loadJSON("jobs.json");
  res.json(jobs);
};

// GET /jobseeker/api/jobs/applied
const getAppliedJobs = (req, res) => {
  const jobseekers = loadJSON("jobseekers.json");
  const user = jobseekers.find(j => j.email === req.user.email);
  if (!user) return res.status(404).json({ error: "User not found" });

  const jobs = loadJSON("jobs.json");
  const appliedJobs = jobs.filter(job => user.appliedJobs?.includes(job.job_id));
  res.json(appliedJobs);
};

// POST /jobseeker/api/jobs/apply
const applyJob = (req, res) => {
  const { job_id } = req.body;
  if (!job_id) return res.status(400).json({ error: "Job ID zrequired" });

  const jobseekers = loadJSON("jobseekers.json");
  const index = jobseekers.findIndex(j => j.email === req.user.email);
  if (index === -1) return res.status(404).json({ error: "User not found" });

  if (!jobseekers[index].appliedJobs) jobseekers[index].appliedJobs = [];
  if (jobseekers[index].appliedJobs.includes(job_id))
    return res.status(400).json({ error: "Already applied" });

  jobseekers[index].appliedJobs.push(job_id);
  saveJSON("jobseekers.json", jobseekers);
  res.json({ message: "Application submitted" });
};

// GET /jobseeker/api/schedule
const getSchedule = (req, res) => {
  const schedules = loadJSON("schedules.json");
  const userSchedules = schedules.filter(s => s.jobseekerEmail === req.user.email);
  res.json(userSchedules || []);
};

// GET /jobseeker/api/notifications
const getNotifications = (req, res) => {
  const notifications = loadJSON("notifications.json");
  const userNotifications = notifications.filter(n => n.jobseekerEmail === req.user.email);
  res.json(userNotifications || []);
};

// PATCH /jobseeker/api/notifications/:id
const markNotificationRead = (req, res) => {
  const notifications = loadJSON("notifications.json");
  const notification = notifications.find(n => n.id === parseInt(req.params.id) && n.jobseekerEmail === req.user.email);

  if (!notification) return res.status(404).json({ error: "Notification not found or does not belong to user" });

  notification.read = true;

  saveJSON("notifications.json", notifications);

  res.json({ message: "Notification marked as read" });
};

// PATCH /jobseeker/api/notifications/mark-all-read
const markAllNotificationsRead = (req, res) => {
  const notifications = loadJSON("notifications.json");
  const updatedNotifications = notifications.map(notif => {
    if (notif.jobseekerEmail === req.user.email) {
      return { ...notif, read: true };
    } else {
      return notif;
    }
  });

  saveJSON("notifications.json", updatedNotifications);

  res.json({ message: "All notifications marked as read" });
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