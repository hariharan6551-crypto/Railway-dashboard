const express = require("express");
const cors = require("cors");
const path = require("path");
const uploadRoutes = require("./routes/uploadRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static directory if there are assets, though not strictly needed here
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../railway.html"));
});

app.use("/api/upload", uploadRoutes);

module.exports = app;
