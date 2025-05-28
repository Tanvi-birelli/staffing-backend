const express = require("express");
const router = express.Router();
const announcementController = require("../controllers/announcement.controller");
const authenticateJWT = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");
const { imageUpload } = require("../utils/multerConfig");

// Admin Announcement Management - Create Announcement
router.post(
  "/announcements",
  authenticateJWT,
  authorize(["admin"]),
  imageUpload.single("image"),
  announcementController.createAnnouncement
);

// Admin Announcement Management - Get Announcements
router.get("/announcements", announcementController.getAnnouncements);

// Admin Announcement Management - Delete Announcement
router.delete(
  "/announcements/:id",
  authenticateJWT,
  authorize(["admin"]),
  announcementController.deleteAnnouncement
);

module.exports = router; 