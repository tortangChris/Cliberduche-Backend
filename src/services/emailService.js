// services/emailService.js
const nodemailer = require("nodemailer");

// ─── Transporter ──────────────────────────────────────────
// Uses Gmail SMTP with an App Password.
// Never use your actual Gmail password here — use App Password.
//
// How to get Gmail App Password:
//   1. Go to myaccount.google.com
//   2. Security → 2-Step Verification (must be ON)
//   3. Security → App Passwords
//   4. Select "Mail" + "Other" → generate
//   5. Copy the 16-character password to your .env
//
// Required .env vars:
//   GMAIL_USER=youraddress@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS on port 587
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
    ciphers: "SSLv3",
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
  socketTimeout: 15000,
});

// ─── Helpers ──────────────────────────────────────────────
// Format date → "March 7, 2025"
// Handles all formats MySQL/Node may return:
//   - JS Date object
//   - "2025-03-07" (plain string)
//   - "2025-03-07T16:00:00.000Z" (ISO string)
//   - "Sat Mar 29 2026 00:00:00 GMT+0800" (Date.toString())
const formatDate = (dateStr) => {
  if (!dateStr) return "";

  let date;

  if (dateStr instanceof Date) {
    // Already a JS Date object — use directly
    date = dateStr;
  } else {
    const str = String(dateStr);
    // Check if it's YYYY-MM-DD (with optional time after T)
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      // Parse only the date portion to avoid UTC offset shifting
      date = new Date(
        Number(isoMatch[1]),
        Number(isoMatch[2]) - 1,
        Number(isoMatch[3]),
      );
    } else {
      // Fallback: let JS parse it (e.g. "Sat Mar 29 2026 00:00:00 GMT+0800")
      date = new Date(str);
    }
  }

  if (isNaN(date.getTime())) return String(dateStr); // safety fallback

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// Format "14:30" or "14:30:00" → "2:30 PM"
const formatTime = (timeStr) => {
  if (!timeStr) return "";
  // Strip seconds if present: "14:30:00" → "14:30"
  const clean = String(timeStr).substring(0, 5);
  const [hourStr, minuteStr] = clean.split(":");
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr || "00";
  const meridiem = hour >= 12 ? "PM" : "AM";
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${meridiem}`;
};

// Capitalize first letter
const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, "-") : str;

// ─── Base Email Layout ────────────────────────────────────
// Wraps any content in a consistent branded layout.
const baseLayout = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Appointment Notification</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f4c35 0%,#1a7a56 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">
                Cliberduche Corporation
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">
                Appointment Management System
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafb;border-top:1px solid #e8ecf0;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 6px;color:#6b7280;font-size:12px;">
                Lot 3739 National Highway, 3/F CBD Building, Brgy. Pulo, Cabuyao City, Laguna
              </p>
              <p style="margin:0 0 6px;color:#6b7280;font-size:12px;">
                📞 +63 49 546-6107 / 0967-302-6643 &nbsp;|&nbsp; ✉️ cliberduche.corp@yahoo.com
              </p>
              <p style="margin:12px 0 0;color:#9ca3af;font-size:11px;">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ─── Appointment Detail Block ─────────────────────────────
// Reusable table of appointment details shown in every email.
const appointmentDetails = (appt, extraRows = "") => `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background:#f8fafb;border:1px solid #e8ecf0;border-radius:8px;margin:24px 0;overflow:hidden;">
    <tr style="background:#e8ecf0;">
      <td colspan="2" style="padding:12px 20px;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.8px;">
          Appointment Details
        </p>
      </td>
    </tr>
    ${[
      ["Reference Code", `<strong>${appt.reference_code}</strong>`],
      ["Full Name", appt.full_name],
      ["Email", appt.email],
      ["Contact No.", appt.contact_number],
      ["Date", formatDate(appt.appointment_date)],
      ["Time", formatTime(appt.appointment_time)],
      ["Type", capitalize(appt.consultation_type)],
      ...(appt.notes ? [["Notes", appt.notes]] : []),
    ]
      .map(
        ([label, value], i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafb"};">
        <td style="padding:11px 20px;font-size:13px;color:#6b7280;font-weight:600;width:38%;border-bottom:1px solid #e8ecf0;">
          ${label}
        </td>
        <td style="padding:11px 20px;font-size:13px;color:#111827;border-bottom:1px solid #e8ecf0;">
          ${value}
        </td>
      </tr>
    `,
      )
      .join("")}
    ${extraRows}
  </table>
`;

// ─── sendApprovedEmail ────────────────────────────────────
// Sent when admin approves an appointment.
// appt: full appointment row from DB (includes meeting_link if online)
const sendApprovedEmail = async (appt) => {
  const isOnline = appt.consultation_type === "online";

  const meetingLinkRow =
    isOnline && appt.meeting_link
      ? `
    <tr style="background:#ecfdf5;">
      <td style="padding:11px 20px;font-size:13px;color:#065f46;font-weight:600;width:38%;border-bottom:1px solid #d1fae5;">
        Meeting Link
      </td>
      <td style="padding:11px 20px;font-size:13px;border-bottom:1px solid #d1fae5;">
        <a href="${appt.meeting_link}" style="color:#059669;font-weight:600;text-decoration:none;">
          ${appt.meeting_link}
        </a>
      </td>
    </tr>
  `
      : "";

  const content = `
    <!-- Status Badge -->
    <div style="text-align:center;margin-bottom:28px;">
      <span style="display:inline-block;background:#ecfdf5;color:#065f46;border:1.5px solid #6ee7b7;border-radius:999px;padding:6px 20px;font-size:13px;font-weight:700;letter-spacing:0.5px;">
        ✅ &nbsp;APPOINTMENT APPROVED
      </span>
    </div>

    <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">
      Good news, ${appt.full_name}!
    </h2>
    <p style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">
      Your appointment with <strong>Cliberduche Corporation</strong> has been
      <strong style="color:#059669;">approved</strong>.
      We look forward to meeting with you.
    </p>

    ${appointmentDetails(appt, meetingLinkRow)}

    ${
      isOnline && appt.meeting_link
        ? `
      <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#065f46;">📹 Online Consultation</p>
        <p style="margin:0 0 8px;font-size:13px;color:#374151;">
          Please join the meeting using the link provided above at your scheduled time.
        </p>
        <a href="${appt.meeting_link}"
          style="display:inline-block;background:#059669;color:#ffffff;font-weight:600;font-size:13px;padding:10px 22px;border-radius:6px;text-decoration:none;">
          Join Meeting →
        </a>
      </div>
    `
        : `
      <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#065f46;">📍 Face-to-Face Consultation</p>
        <p style="margin:0;font-size:13px;color:#374151;">
          Please be at our office on time: <strong>Lot 3739 National Highway, 3/F CBD Building, Brgy. Pulo, Cabuyao City, Laguna</strong>.
        </p>
      </div>
    `
    }

    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      If you need to reschedule or have any questions, please contact us at
      <a href="mailto:cliberduche.corp@yahoo.com" style="color:#059669;">cliberduche.corp@yahoo.com</a>
      or call <strong>+63 49 546-6107</strong>.
    </p>
  `;

  await transporter.sendMail({
    from: `"Cliberduche Corporation" <${process.env.GMAIL_USER}>`,
    to: appt.email,
    subject: `✅ Appointment Approved — ${formatDate(appt.appointment_date)} at ${formatTime(appt.appointment_time)}`,
    html: baseLayout(content),
  });
};

// ─── sendRejectedEmail ────────────────────────────────────
// Sent when admin rejects an appointment.
// appt: full appointment row from DB (includes reason if provided)
const sendRejectedEmail = async (appt) => {
  const content = `
    <!-- Status Badge -->
    <div style="text-align:center;margin-bottom:28px;">
      <span style="display:inline-block;background:#fef2f2;color:#991b1b;border:1.5px solid #fca5a5;border-radius:999px;padding:6px 20px;font-size:13px;font-weight:700;letter-spacing:0.5px;">
        ❌ &nbsp;APPOINTMENT NOT APPROVED
      </span>
    </div>

    <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">
      Dear ${appt.full_name},
    </h2>
    <p style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">
      We regret to inform you that your appointment request with
      <strong>Cliberduche Corporation</strong> has been
      <strong style="color:#dc2626;">declined</strong> at this time.
    </p>

    ${appointmentDetails(appt)}

    ${
      appt.cancellation_reason
        ? `
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#991b1b;">Reason for Declination</p>
        <p style="margin:0;font-size:13px;color:#374151;">${appt.cancellation_reason}</p>
      </div>
    `
        : ""
    }

    <p style="margin:0 0 16px;font-size:13px;color:#374151;line-height:1.6;">
      We encourage you to book another appointment at a different date or time.
      You may also reach out to us directly if you have any concerns.
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      Contact us at
      <a href="mailto:cliberduche.corp@yahoo.com" style="color:#059669;">cliberduche.corp@yahoo.com</a>
      or call <strong>+63 49 546-6107</strong>.
    </p>
  `;

  await transporter.sendMail({
    from: `"Cliberduche Corporation" <${process.env.GMAIL_USER}>`,
    to: appt.email,
    subject: `❌ Appointment Update — Reference ${appt.reference_code}`,
    html: baseLayout(content),
  });
};

// ─── sendCancelledEmail ──────────────────────────────────
// Sent when admin cancels an appointment.
const sendCancelledEmail = async (appt) => {
  const content = `
    <!-- Status Badge -->
    <div style="text-align:center;margin-bottom:28px;">
      <span style="display:inline-block;background:#f9fafb;color:#374151;border:1.5px solid #d1d5db;border-radius:999px;padding:6px 20px;font-size:13px;font-weight:700;letter-spacing:0.5px;">
        🚫 &nbsp;APPOINTMENT CANCELLED
      </span>
    </div>

    <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">
      Dear ${appt.full_name},
    </h2>
    <p style="margin:0 0 4px;color:#374151;font-size:15px;line-height:1.6;">
      We would like to inform you that your appointment with
      <strong>Cliberduche Corporation</strong> scheduled on
      <strong>${formatDate(appt.appointment_date)}</strong> at
      <strong>${formatTime(appt.appointment_time)}</strong> has been
      <strong style="color:#6b7280;">cancelled</strong>.
    </p>

    ${appointmentDetails(appt)}

    ${
      appt.cancellation_reason
        ? `
      <div style="background:#f9fafb;border:1px solid #d1d5db;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#374151;">Reason for Cancellation</p>
        <p style="margin:0;font-size:13px;color:#374151;">${appt.cancellation_reason}</p>
      </div>
    `
        : ""
    }

    <p style="margin:0 0 16px;font-size:13px;color:#374151;line-height:1.6;">
      We apologize for any inconvenience this may have caused. You are welcome to
      book a new appointment at your preferred date and time.
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      Contact us at
      <a href="mailto:cliberduche.corp@yahoo.com" style="color:#059669;">cliberduche.corp@yahoo.com</a>
      or call <strong>+63 49 546-6107</strong>.
    </p>
  `;

  await transporter.sendMail({
    from: `"Cliberduche Corporation" <${process.env.GMAIL_USER}>`,
    to: appt.email,
    subject: `🚫 Appointment Cancelled — Reference ${appt.reference_code}`,
    html: baseLayout(content),
  });
};

module.exports = { sendApprovedEmail, sendRejectedEmail, sendCancelledEmail };
