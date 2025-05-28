const express = require("express");
const router = express.Router();
const contactController = require("../controllers/contact.controller");

// Contact Us Route
router.post("/contact", contactController.submitContact);

module.exports = router; 