const express = require("express");
const router = express.Router();
const hrController = require("../controllers/hr.controller");
const protect = require("../middleware/auth.middleware");

// HR Profile Management Routes
router.get("/profile", protect, hrController.getProfile);
router.put("/profile", protect, hrController.updateProfile);

// HR Schedule Routes
router.get("/hr/schedule", protect, hrController.getSchedule);

// HR Notification Routes
router.get("/hr/notifications", protect, hrController.getNotifications);
router.patch("/hr/notifications/:id", protect, hrController.markNotificationRead);
router.patch("/hr/notifications/mark-all-read", protect, hrController.markAllNotificationsRead);

// HR Application Management & Interview Scheduling Routes
router.post("/applications/:applicationId/schedule-interview", protect, hrController.scheduleInterview);

// HR Job Management Routes
router.post("/jobs", protect, hrController.createJob);
router.get("/jobs", protect, hrController.getAllJobs);
router.get("/jobs/:jobId", protect, hrController.getJobById);
router.put("/jobs/:jobId", protect, hrController.updateJob);
router.delete("/jobs/:jobId", protect, hrController.deleteJob);

// HR Job Application Management Routes
router.get("/applications", protect, hrController.getAllApplications);
router.get("/applications/:applicationId", protect, hrController.getApplicationById);
router.put("/applications/:applicationId/status", protect, hrController.updateApplicationStatus);

// HR Jobseeker Management Routes
router.get("/jobseekers/:jobseekerId/profile", protect, hrController.getJobseekerProfile);

module.exports = router; 