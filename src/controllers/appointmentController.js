// controllers/appointmentController.js
const pool = require("../config/db");
const generateReference = require("../utils/generateReference");

// ── POST /appointments ────────────────────────────────────
// Book a new appointment (client-facing)
exports.bookAppointment = async (req, res) => {
  try {
    const {
      full_name,
      email,
      contact_number,
      appointment_date,
      appointment_time,
      consultation_type,
      notes,
    } = req.body;

    const today = new Date();
    const selectedDate = new Date(appointment_date);

    if (selectedDate < new Date(today.toDateString())) {
      return res.status(400).json({ message: "Cannot book past date" });
    }

    const [existing] = await pool.query(
      `SELECT * FROM appointments 
       WHERE appointment_date = ? 
       AND appointment_time = ?
       AND status IN ('pending','approved')`,
      [appointment_date, appointment_time],
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Time slot already booked" });
    }

    const reference_code = generateReference();

    await pool.query(
      `INSERT INTO appointments 
      (reference_code, full_name, email, contact_number, appointment_date, appointment_time, consultation_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference_code,
        full_name,
        email,
        contact_number,
        appointment_date,
        appointment_time,
        consultation_type,
        notes,
      ],
    );

    res.status(201).json({
      message: "Appointment booked successfully",
      reference_code,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /appointments/check/:reference_code ───────────────
// Client checks their appointment status by reference code
exports.checkAppointment = async (req, res) => {
  try {
    const { reference_code } = req.params;

    const [appointment] = await pool.query(
      "SELECT * FROM appointments WHERE reference_code = ?",
      [reference_code],
    );

    if (appointment.length === 0)
      return res.status(404).json({ message: "Not found" });

    res.json(appointment[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /appointments ─────────────────────────────────────
// Admin: get all appointments with optional filters
// Query params: status, consultation_type, appointment_date, search
exports.getAllAppointments = async (req, res) => {
  try {
    const { status, consultation_type, appointment_date, search } = req.query;

    let query = "SELECT * FROM appointments WHERE 1=1";
    const params = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (consultation_type) {
      query += " AND consultation_type = ?";
      params.push(consultation_type);
    }

    if (appointment_date) {
      query += " AND appointment_date = ?";
      params.push(appointment_date);
    }

    if (search) {
      query +=
        " AND (full_name LIKE ? OR email LIKE ? OR reference_code LIKE ?)";
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    query += " ORDER BY appointment_date DESC, appointment_time DESC";

    const [appointments] = await pool.query(query, params);
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── GET /appointments/:id ─────────────────────────────────
// Admin: get single appointment by ID
exports.getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const [appointment] = await pool.query(
      "SELECT * FROM appointments WHERE id = ?",
      [id],
    );

    if (appointment.length === 0)
      return res.status(404).json({ message: "Appointment not found" });

    res.json(appointment[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── PATCH /appointments/:id/approve ──────────────────────
// Admin: approve an appointment
// Body (online only): { meeting_link }
exports.approveAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { meeting_link } = req.body;

    const [appointment] = await pool.query(
      "SELECT * FROM appointments WHERE id = ?",
      [id],
    );

    if (appointment.length === 0)
      return res.status(404).json({ message: "Appointment not found" });

    if (appointment[0].status !== "pending")
      return res
        .status(400)
        .json({ message: "Only pending appointments can be approved" });

    if (appointment[0].consultation_type === "online" && !meeting_link) {
      return res
        .status(400)
        .json({ message: "Meeting link is required for online appointments" });
    }

    await pool.query(
      "UPDATE appointments SET status = 'approved', meeting_link = ? WHERE id = ?",
      [meeting_link || null, id],
    );

    res.json({ message: "Appointment approved successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── PATCH /appointments/:id/reject ───────────────────────
// Admin: reject an appointment
// Body (optional): { reason }
exports.rejectAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [appointment] = await pool.query(
      "SELECT * FROM appointments WHERE id = ?",
      [id],
    );

    if (appointment.length === 0)
      return res.status(404).json({ message: "Appointment not found" });

    if (appointment[0].status !== "pending")
      return res
        .status(400)
        .json({ message: "Only pending appointments can be rejected" });

    await pool.query(
      "UPDATE appointments SET status = 'rejected', reason = ? WHERE id = ?",
      [reason || null, id],
    );

    res.json({ message: "Appointment rejected" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── PATCH /appointments/:id/complete ─────────────────────
// Admin: mark an appointment as completed
exports.completeAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const [appointment] = await pool.query(
      "SELECT * FROM appointments WHERE id = ?",
      [id],
    );

    if (appointment.length === 0)
      return res.status(404).json({ message: "Appointment not found" });

    if (appointment[0].status !== "approved")
      return res
        .status(400)
        .json({ message: "Only approved appointments can be completed" });

    await pool.query(
      "UPDATE appointments SET status = 'completed' WHERE id = ?",
      [id],
    );

    res.json({ message: "Appointment marked as completed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── PATCH /appointments/:id/cancel ───────────────────────
// Admin: cancel an appointment (pending or approved)
// Body (optional): { reason }
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [appointment] = await pool.query(
      "SELECT * FROM appointments WHERE id = ?",
      [id],
    );

    if (appointment.length === 0)
      return res.status(404).json({ message: "Appointment not found" });

    if (!["pending", "approved"].includes(appointment[0].status))
      return res
        .status(400)
        .json({
          message: "Only pending or approved appointments can be cancelled",
        });

    await pool.query(
      "UPDATE appointments SET status = 'cancelled', reason = ? WHERE id = ?",
      [reason || null, id],
    );

    res.json({ message: "Appointment cancelled" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
