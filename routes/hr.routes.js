const express = require("express");
const router = express.Router();
const hrController = require("../controllers/hr.controller");
const authenticateJWT = require("../middleware/auth.middleware");
const authorize = require("../middleware/role.middleware");

const hrAuth = [authenticateJWT, authorize(["hr"])]

// Example: Get all jobs
router.get("/hr/jobs", ...hrAuth, hrController.getAllJobs);
// Example: Review application
router.post("/hr/applications/review", ...hrAuth, hrController.reviewApplication);

module.exports = router; 