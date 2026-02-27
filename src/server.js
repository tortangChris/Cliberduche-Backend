// src/server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");
const appointmentRoutes = require("./routes/appointmentRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // important para hindi undefined req.body

// Routes
app.use("/api/appointments", appointmentRoutes);
app.use("/api/admin", adminRoutes);

// Test root
app.get("/", (req, res) => {
  res.send("Appointment API Running...");
});

// TEST DATABASE CONNECTION
pool
  .getConnection()
  .then(() => {
    console.log("✅ Database Connected Successfully");
  })
  .catch((err) => {
    console.error("❌ Database Connection Failed:", err.message);
  });

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
