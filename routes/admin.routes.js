const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const authenticateJWT = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

const adminAuth = [authenticateJWT, authorize(["admin"])]

// Example: Get all users
router.get("/admin/users", ...adminAuth, adminController.getAllUsers);
// Example: Create FAQ
router.post("/admin/faqs", ...adminAuth, adminController.createFAQ);

module.exports = router; 