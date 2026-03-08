// src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const verifyAdmin = require("../middleware/authMiddleware");
const {
  login,
  getAppointments,
  approveAppointment,
  rejectAppointment,
  completeAppointment,
  deleteAppointment,
} = require("../controllers/adminController");

// Admin login
router.post("/login", login);

// Get all appointments (Admin only)
router.get("/appointments", verifyAdmin, getAppointments);

// Approve an appointment (Admin only)
router.put("/appointments/:id/approve", verifyAdmin, approveAppointment);

// Reject an appointment (Admin only)
router.put("/appointments/:id/reject", verifyAdmin, rejectAppointment);

// Mark as completed (Admin only)
router.put("/appointments/:id/complete", verifyAdmin, completeAppointment);

// Debug Test route to check admin route working
router.get("/", (req, res) => {
  res.json({ message: "Admin routes working" });
});

// Delete an appointment (Admin only)
router.delete("/appointments/:id", verifyAdmin, deleteAppointment);

module.exports = router;
