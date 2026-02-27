const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// Admin Login
exports.login = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ message: "Request body missing" });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const [admin] = await pool.query("SELECT * FROM admins WHERE email = ?", [
      email,
    ]);

    if (admin.length === 0)
      return res.status(401).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, admin[0].password);

    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: admin[0].id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get All Appointments
exports.getAppointments = async (req, res) => {
  try {
    const { name } = req.query;
    let query =
      "SELECT id, full_name, email, contact_number, appointment_date, appointment_time, consultation_type, status FROM appointments";
    const params = [];

    if (name) {
      query += " WHERE full_name LIKE ?";
      params.push(`%${name}%`);
    }

    query += " ORDER BY created_at DESC";

    const [appointments] = await pool.query(query, params);
    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch appointments" });
  }
};

// Approve Appointment
exports.approveAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { meeting_link } = req.body;

    if (!id)
      return res.status(400).json({ message: "Appointment ID required" });

    await pool.query(
      "UPDATE appointments SET status='approved', meeting_link=? WHERE id=?",
      [meeting_link || null, id],
    );

    res.json({ message: "Appointment approved" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to approve appointment" });
  }
};

// Reject Appointment
exports.rejectAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellation_reason } = req.body;

    if (!id)
      return res.status(400).json({ message: "Appointment ID required" });

    await pool.query(
      "UPDATE appointments SET status='rejected', cancellation_reason=? WHERE id=?",
      [cancellation_reason || "No reason provided", id],
    );

    res.json({ message: "Appointment rejected" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to reject appointment" });
  }
};

// Complete Appointment
exports.completeAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id)
      return res.status(400).json({ message: "Appointment ID required" });

    await pool.query("UPDATE appointments SET status='completed' WHERE id=?", [
      id,
    ]);

    res.json({ message: "Appointment marked as completed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to complete appointment" });
  }
};
