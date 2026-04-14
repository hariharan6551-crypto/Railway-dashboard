const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// Storage config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Upload API
app.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    res.json({
        message: "File uploaded successfully",
        file: req.file
    });
});

// Webhook endpoint for Google Sheets Apps Script integration
app.post("/sheet-update", (req, res) => {
    console.log("Received Google Sheets update:", req.body);
    
    // Broadcast the update to all connected frontend clients
    io.emit("sheet_updated", {
        timestamp: Date.now(),
        data: req.body
    });
    
    res.status(200).json({ message: "Update received and broadcasted" });
});

// WebSocket connections
io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);
    
    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

// Server start
server.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});