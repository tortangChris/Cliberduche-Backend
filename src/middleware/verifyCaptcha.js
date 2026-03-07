const axios = require("axios");

const verifyCaptcha = async (req, res, next) => {
  const token = req.body.captcha_token;

  if (!token) {
    return res.status(400).json({ message: "CAPTCHA token is missing." });
  }

  try {
    const { data } = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: token,
        },
      },
    );

    if (!data.success) {
      return res.status(400).json({
        message: "CAPTCHA verification failed. Please try again.",
        errors: data["error-codes"] || [],
      });
    }

    // Token is valid — continue to the actual route handler
    next();
  } catch (error) {
    return res.status(500).json({
      message: "Could not verify CAPTCHA. Please try again later.",
    });
  }
};

module.exports = verifyCaptcha;
