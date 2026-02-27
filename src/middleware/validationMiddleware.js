// src/middleware/validationMiddleware.js
const pool = require("../config/db");

const validateAppointment = async (req, res, next) => {
  try {
    const {
      full_name,
      email,
      contact_number,
      appointment_date,
      appointment_time,
      consultation_type,
    } = req.body;

    //Required fields
    if (
      !full_name ||
      !email ||
      !contact_number ||
      !appointment_date ||
      !appointment_time ||
      !consultation_type
    ) {
      return res
        .status(400)
        .json({ message: "Please fill all required fields" });
    }

    //Email format simple check
    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    //Prevent past date/time
    const now = new Date();
    const appointmentDateTime = new Date(
      `${appointment_date}T${appointment_time}`,
    );
    if (appointmentDateTime < now) {
      return res.status(400).json({ message: "Cannot book past date/time" });
    }

    //Prevent double booking (pending or approved)
    const [existing] = await pool.query(
      `SELECT * FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status IN ('pending','approved')`,
      [appointment_date, appointment_time],
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "This slot is already booked" });
    }

    next(); //all good na, proceed to controller
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Validation error" });
  }
};

module.exports = { validateAppointment };
