// routes/appointmentRoutes.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/appointmentController");

// ── Client routes ─────────────────────────────────────────
router.post("/", ctrl.bookAppointment);
router.get("/check/:reference_code", ctrl.checkAppointment);

// ── Admin routes ──────────────────────────────────────────
router.get("/", ctrl.getAllAppointments);
router.get("/:id", ctrl.getAppointmentById);
router.patch("/:id/approve", ctrl.approveAppointment);
router.patch("/:id/reject", ctrl.rejectAppointment);
router.patch("/:id/complete", ctrl.completeAppointment);
router.patch("/:id/cancel", ctrl.cancelAppointment);

module.exports = router;
