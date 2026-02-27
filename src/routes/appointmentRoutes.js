// src/routes/appointmentRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db"); // for direct query
const {
  bookAppointment,
  checkAppointment,
} = require("../controllers/appointmentController");
const { validateAppointment } = require("../middleware/validationMiddleware");

// Book appointment with validation
router.post("/", validateAppointment, bookAppointment);

// Check appointment by reference code
router.get("/:reference_code", checkAppointment);

// Get all appointments (manual check by name only)
router.get("/", async (req, res) => {
  try {
    const { name } = req.query; // optional filter by name
    let query =
      "SELECT id, full_name, email, contact_number, appointment_date, appointment_time, consultation_type, status FROM appointments";
    const params = [];

    if (name) {
      query += " WHERE full_name LIKE ?";
      params.push(`%${name}%`);
    }

    query += " ORDER BY appointment_date ASC";

    const [appointments] = await pool.query(query, params);
    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch appointments" });
  }
});

module.exports = router;
