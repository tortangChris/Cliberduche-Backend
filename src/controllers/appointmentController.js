// controllers/appointmentController.js
const pool = require("../config/db");
const generateReference = require("../utils/generateReference");
const {
  sendApprovedEmail,
  sendRejectedEmail,
  sendCancelledEmail,
} = require("../services/emailService");

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

    // Normalize appointment_date — strip time portion if frontend sends
    // a full ISO string like "2026-03-29T16:00:00.000Z".
    // We only ever store and compare the plain date "YYYY-MM-DD".
    const normalizedDate = String(appointment_date).split("T")[0];

    // String comparison (YYYY-MM-DD) avoids timezone offset bugs.
    // new Date("2025-03-07") is UTC midnight → becomes March 6 in UTC+8,
    // making valid future dates incorrectly fail the past-date check.
    const todayStr = new Date().toLocaleDateString("en-CA"); // "YYYY-MM-DD" local
    if (normalizedDate < todayStr) {
      return res.status(400).json({ message: "Cannot book past date" });
    }

    const [existing] = await pool.query(
      `SELECT * FROM appointments 
       WHERE appointment_date = ? 
       AND appointment_time = ?
       AND status IN ('pending','approved')`,
      [normalizedDate, appointment_time],
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
        normalizedDate, // always plain "YYYY-MM-DD"
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
// Admin: approve an appointment + send email to client
exports.approveAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { meeting_link } = req.body;

    const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ?", [
      id,
    ]);

    if (rows.length === 0)
      return res.status(404).json({ message: "Appointment not found" });

    const appointment = rows[0];

    if (appointment.status !== "pending")
      return res
        .status(400)
        .json({ message: "Only pending appointments can be approved" });

    if (appointment.consultation_type === "online" && !meeting_link)
      return res
        .status(400)
        .json({ message: "Meeting link is required for online appointments" });

    // Update DB status
    await pool.query(
      "UPDATE appointments SET status = 'approved', meeting_link = ? WHERE id = ?",
      [meeting_link || null, id],
    );

    // Build updated appointment object for the email
    const updatedAppointment = {
      ...appointment,
      status: "approved",
      meeting_link: meeting_link || null,
    };

    // Send approval email — non-blocking (won't fail the response if email fails)
    sendApprovedEmail(updatedAppointment).catch((err) =>
      console.error(
        `[Email] Failed to send approval email to ${appointment.email}:`,
        err.message,
      ),
    );

    res.json({ message: "Appointment approved successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ── PATCH /appointments/:id/reject ───────────────────────
// Admin: reject an appointment + send email to client
exports.rejectAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ?", [
      id,
    ]);

    if (rows.length === 0)
      return res.status(404).json({ message: "Appointment not found" });

    const appointment = rows[0];

    if (appointment.status !== "pending")
      return res
        .status(400)
        .json({ message: "Only pending appointments can be rejected" });

    // Update DB status
    await pool.query(
      "UPDATE appointments SET status = 'rejected', cancellation_reason = ? WHERE id = ?",
      [reason || null, id],
    );

    // Build updated appointment object for the email
    const updatedAppointment = {
      ...appointment,
      status: "rejected",
      cancellation_reason: reason || null,
    };

    // Send rejection email — non-blocking
    sendRejectedEmail(updatedAppointment).catch((err) =>
      console.error(
        `[Email] Failed to send rejection email to ${appointment.email}:`,
        err.message,
      ),
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

    const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ?", [
      id,
    ]);

    if (rows.length === 0)
      return res.status(404).json({ message: "Appointment not found" });

    if (rows[0].status !== "approved")
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
// Admin: cancel a pending or approved appointment
exports.cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const [rows] = await pool.query("SELECT * FROM appointments WHERE id = ?", [
      id,
    ]);

    if (rows.length === 0)
      return res.status(404).json({ message: "Appointment not found" });

    if (!["pending", "approved"].includes(rows[0].status))
      return res
        .status(400)
        .json({
          message: "Only pending or approved appointments can be cancelled",
        });

    await pool.query(
      "UPDATE appointments SET status = 'cancelled', cancellation_reason = ? WHERE id = ?",
      [reason || null, id],
    );

    // Send cancellation email — non-blocking
    const cancelledAppointment = {
      ...rows[0],
      status: "cancelled",
      cancellation_reason: reason || null,
    };
    sendCancelledEmail(cancelledAppointment).catch((err) =>
      console.error(
        `[Email] Failed to send cancellation email to ${rows[0].email}:`,
        err.message,
      ),
    );

    res.json({ message: "Appointment cancelled" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
