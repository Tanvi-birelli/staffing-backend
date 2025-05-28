const { loadJSON, saveJSON } = require("../utils/fileHelpers");

// GET /jobseeker/api/profile
const getProfile = (req, res) => {
  const users = loadJSON("users.json");
  const jobseekers = loadJSON("jobseekers.json");

  // Find user and jobseeker by email
  const user = users.find(u => u.email === req.user.email);
  const jobseeker = jobseekers.find(j => j.email === req.user.email);

  if (!user || !jobseeker) return res.status(404).json({ error: "Profile not found" });

  // Merge user and jobseeker data (user fields take precedence)
  const profile = {
    ...jobseeker,
    ...user, // name, phone, etc. from user
  };

  res.json(profile);
};



// PUT /jobseeker/api/profile
const updateProfile = (req, res) => {
  // Load jobseekers data (assuming it contains all profile fields including name and parent)
  let jobseekers = loadJSON("jobseekers.json"); // Use 'let' because we will modify the array

  // Find the index of the jobseeker entry by email
  const index = jobseekers.findIndex(j => j.email === req.user.email);

  // If not found, return 404
  if (index === -1) {
     console.warn(`Profile not found for update for email: ${req.user.email}`);
     return res.status(404).json({ error: "Profile not found" });
  }

  // Get the existing jobseeker object
  const existingJobseeker = jobseekers[index];

  // Create the updated jobseeker object
  // Spread existing data, then overwrite with fields from req.body
  // This will include the nested 'parent' object if sent by the frontend
  const updatedJobseeker = {
    ...existingJobseeker,
    ...req.body,
    // IMPORTANT: Prevent overwriting sensitive fields like email, password, resume, appliedJobs if they are also sent in req.body by mistake
    // If these fields should NOT be updated via this PUT endpoint, explicitly keep the existing values:
    email: existingJobseeker.email,
    // password: existingJobseeker.password, // Don't update password here - use a dedicated password change endpoint
    // resume: existingJobseeker.resume, // Don't update resume here - use a dedicated upload endpoint
    // appliedJobs: existingJobseeker.appliedJobs, // Don't update appliedJobs here - use apply/unapply endpoints
    // user_id: existingJobseeker.user_id,
    // voat_id: existingJobseeker.voat_id,
  };


  // Replace the old entry with the updated one
  jobseekers[index] = updatedJobseeker;

  // Save the modified array back to the file
  saveJSON("jobseekers.json", jobseekers);

  // Return success message and the updated profile data
  // Exclude password from the response for security
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
  const jobseekers = loadJSON("jobseekers.json");
  const user = jobseekers.find(j => j.email === req.user.email);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json(user.schedule || []);
};

// GET /jobseeker/api/dashboard
const getDashboard = (req, res) => {
  const jobseekers = loadJSON("jobseekers.json");
  const user = jobseekers.find(j => j.email === req.user.email);
  if (!user) return res.status(404).json({ error: "User not found" });

  const jobs = loadJSON("jobs.json");
  const appliedJobs = user.appliedJobs || [];

  res.json({
    appliedCount: appliedJobs.length,
    scheduled: user.schedule?.length || 0,
    notifications: user.notifications?.length || 0,
  });
};

// GET /jobseeker/api/notifications
const getNotifications = (req, res) => {
  const jobseekers = loadJSON("jobseekers.json");
  const user = jobseekers.find(j => j.email === req.user.email);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json(user.notifications || []);
};

// PATCH /jobseeker/api/notifications/:id
const markNotificationRead = (req, res) => {
  const jobseekers = loadJSON("jobseekers.json");
  const index = jobseekers.findIndex(j => j.email === req.user.email);
  if (index === -1) return res.status(404).json({ error: "User not found" });

  const notifs = jobseekers[index].notifications || [];
  const notif = notifs.find(n => n.id === req.params.id);
  if (!notif) return res.status(404).json({ error: "Notification not found" });

  notif.read = true;
  saveJSON("jobseekers.json", jobseekers);
  res.json({ message: "Notification marked as read" });
};

module.exports = {
  getProfile,
  updateProfile,
  getJobs,
  getAppliedJobs,
  applyJob,
  getSchedule,
  getDashboard,
  getNotifications,
  markNotificationRead
}; 