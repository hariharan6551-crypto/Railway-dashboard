const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
const { handleFileUpload } = require("../controllers/uploadController");

// Use multer middleware for single file upload
router.post("/", upload.single("file"), handleFileUpload);

// Error handler for multer errors
router.use((err, req, res, next) => {
    if (err) {
        return res.status(400).json({ message: err.message });
    }
    next();
});

module.exports = router;
