const express = require("express");
const router = express.Router();
const jobseekerController = require("../controllers/jobseeker.controller");
const authenticateJWT = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

const jobseekerAuth = [authenticateJWT, authorize(["jobseeker"])]

router.get("/jobseeker/api/profile", ...jobseekerAuth, jobseekerController.getProfile);
router.put("/jobseeker/api/profile", ...jobseekerAuth, jobseekerController.updateProfile);
router.get("/jobseeker/api/schedule", ...jobseekerAuth, jobseekerController.getSchedule);
router.get("/jobseeker/api/notifications", ...jobseekerAuth, jobseekerController.getNotifications);
router.patch("/jobseeker/api/notifications/:id", ...jobseekerAuth, jobseekerController.markNotificationRead);
router.patch("/jobseeker/api/notifications/mark-all-read", ...jobseekerAuth, jobseekerController.markAllNotificationsRead);

module.exports = router; 