const pool = require("../config/db");
const generateReference = require("../utils/generateReference");

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
