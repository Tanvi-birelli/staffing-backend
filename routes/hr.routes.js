const express = require("express");
const router = express.Router();
const hrController = require("../controllers/hr.controller");
const authenticateJWT = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

const hrAuth = [authenticateJWT, authorize(["hr"])]

// HR Profile Management Routes
router.get("/hr/profile", ...hrAuth, hrController.getProfile);
router.put("/hr/profile", ...hrAuth, hrController.updateProfile);

// HR Schedule Routes
router.get("/hr/schedule", ...hrAuth, hrController.getSchedule);

// HR Notification Routes
router.get("/hr/notifications", ...hrAuth, hrController.getNotifications);
router.patch("/hr/notifications/:id", ...hrAuth, hrController.markNotificationRead);
router.patch("/hr/notifications/mark-all-read", ...hrAuth, hrController.markAllNotificationsRead);

module.exports = router; 