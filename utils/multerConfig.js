const multer = require("multer");
const path = require("path");

// Multer storage configuration for resumes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(
      null,
      `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`
    );
  },
});

// Multer storage configuration for announcement images
const imageStorage = multer.diskStorage({
  destination: "uploads/announcements/",
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}${path.extname(file.originalname)}`);
  },
});

// Multer upload middleware for resumes (PDF only)
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF resumes are allowed"), false);
    }
  },
});

// Multer upload middleware for images (JPEG, JPG, PNG only)
const imageUpload = multer({
  storage: imageStorage,
  fileFilter: (req, file, cb) => {
    const isImage = /jpeg|jpg|png/.test(file.mimetype);
    cb(null, isImage);
  },
});

module.exports = {
  upload,
  imageUpload
}; 