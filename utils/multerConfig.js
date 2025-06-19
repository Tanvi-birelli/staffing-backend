const multer = require("multer");
const path = require("path");

// Multer storage configuration for resumes
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/resumes/");
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

// Centralized file filter for resumes (PDF, DOC, DOCX)
const resumeFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ];
  const allowedExtensions = [".pdf", ".doc", ".docx"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, DOC, and DOCX files are allowed."), false);
  }
};

// Multer upload middleware for resumes (PDF, DOC, DOCX, 5MB limit)
const upload = multer({
  storage,
  fileFilter: resumeFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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