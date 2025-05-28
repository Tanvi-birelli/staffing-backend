const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");
const { loadAnnouncements, saveAnnouncements } = require("../utils/fileHelpers");

// Admin Announcement Management - Create Announcement
const createAnnouncement = (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: "Title and body required" });
  }

  const announcements = loadAnnouncements();

  const newAnnouncement = {
    id: uuidv4(),
    title,
    body,
    image: req.file?.filename || null,
    date: new Date().toISOString(),
  };

  announcements.push(newAnnouncement);
  saveAnnouncements(announcements);

  res.json({ message: "Announcement added", announcement: newAnnouncement });
};

// Admin Announcement Management - Get Announcements
const getAnnouncements = (req, res) => {
  res.json(loadAnnouncements());
};

// Admin Announcement Management - Delete Announcement
const deleteAnnouncement = (req, res) => {
  const announcements = loadAnnouncements();
  const announcement = announcements.find((a) => a.id === req.params.id);
  if (!announcement) return res.status(404).json({ error: "Not found" });

  if (announcement.image) {
    const imagePath = path.join(
      __dirname,
      "..",
      "uploads",
      "announcements",
      announcement.image
    );
    fs.unlink(imagePath, (err) => {
      if (err) console.error("Error deleting image:", err);
    });
  }

  const filtered = announcements.filter((a) => a.id !== req.params.id);
  saveAnnouncements(filtered);
  res.json({ message: "Announcement deleted" });
};

module.exports = {
    createAnnouncement,
    getAnnouncements,
    deleteAnnouncement
}; 