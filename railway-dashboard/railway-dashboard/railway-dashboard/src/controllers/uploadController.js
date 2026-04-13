const handleFileUpload = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded or invalid file format" });
    }

    res.status(200).json({
        message: "File uploaded successfully",
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path
    });
};

module.exports = {
    handleFileUpload
};
