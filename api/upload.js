const multer = require("multer");
const path = require("path");

// Use memory storage for serverless (no persistent disk)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.pptx', '.ppt'].includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error("Only Excel (.xlsx, .xls) and PowerPoint (.pptx, .ppt) files are allowed"), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

module.exports = (req, res) => {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method not allowed" });
    }

    const uploadSingle = upload.single("file");

    uploadSingle(req, res, (err) => {
        if (err) {
            return res.status(400).json({ message: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded or invalid file format" });
        }

        res.status(200).json({
            message: "File uploaded successfully",
            filename: req.file.originalname,
            originalName: req.file.originalname,
            size: req.file.size
        });
    });
};
