const validator = require("validator");
const { createContact } = require("../utils/dbHelpers");

// Contact Us Controller
const submitContact = async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !validator.isEmail(email) || !message) {
    return res.status(400).json({ error: "Invalid input" });
  }
  
  try {
    await createContact({ name, email, subject, message });
  res.json({ message: "Contact message received" });
  } catch (error) {
    console.error("Error submitting contact form:", error);
    res.status(500).json({ error: "Failed to submit contact message" });
  }
};

module.exports = {
    submitContact
}; 