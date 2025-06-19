const express = require("express");
const router = express.Router();
const jobseekerController = require("../controllers/jobseeker.controller");
const authenticateJWT = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");
// Multer is imported and configured in the controller, so we'll access it from there.

const jobseekerAuth = [authenticateJWT, authorize(["jobseeker"])]

router.get("/profile", ...jobseekerAuth, jobseekerController.getProfile);
router.put("/profile", ...jobseekerAuth, jobseekerController.updateProfile);
router.post("/profile/resume", ...jobseekerAuth, jobseekerController.upload.single("resume"), jobseekerController.multerErrorHandler, jobseekerController.uploadResume);
router.get("/profile/resume", ...jobseekerAuth, jobseekerController.getResume);
router.get("/schedule", ...jobseekerAuth, jobseekerController.getSchedule);
router.get("/notifications", ...jobseekerAuth, jobseekerController.getNotifications);
router.put("/notifications/:id/read", ...jobseekerAuth, jobseekerController.markNotificationRead);
router.put("/notifications/mark-all-read", ...jobseekerAuth, jobseekerController.markAllNotificationsRead);
router.delete("/notifications/:id", ...jobseekerAuth, jobseekerController.deleteNotification);
router.get("/notifications/upcoming", ...jobseekerAuth, jobseekerController.getUpcomingNotifications);
router.post("/jobs/apply", ...jobseekerAuth, jobseekerController.applyJob);
router.get("/jobs/applied", ...jobseekerAuth, jobseekerController.getAppliedJobs);
router.get("/jobs", ...jobseekerAuth, jobseekerController.getJobs);
router.get("/jobs/:id", ...jobseekerAuth, jobseekerController.getJobById);

module.exports = router; 