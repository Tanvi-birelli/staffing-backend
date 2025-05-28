const validator = require("validator");
const { v4: uuidv4 } = require("uuid");
const { loadContacts, saveContacts } = require("../utils/fileHelpers");

// Contact Us Controller
const submitContact = (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !validator.isEmail(email) || !message) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const contacts = loadContacts();
  contacts.push({
    id: uuidv4(),
    name,
    email,
    message,
    date: new Date().toISOString(),
  });
  saveContacts(contacts);
  res.json({ message: "Contact message received" });
};

module.exports = {
    submitContact
}; 