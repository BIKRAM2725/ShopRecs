// mailer.js (suggested)
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

function pickCreds() {
  const user = process.env.EMAIL_USER || process.env.EMAIL || process.env.SMTP_USER || "";
  const pass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || process.env.SMTP_PASS || "";
  return { user, pass };
}

export async function createTransporter() {
  const { user, pass } = pickCreds();

  // Dev fallback: ethereal if no real creds
  if (process.env.NODE_ENV !== "production" && (!user || !pass)) {
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  }

  if (!user || !pass) {
    throw new Error("Email credentials are not configured. Set EMAIL_USER & EMAIL_PASS (or SMTP_USER/SMTP_PASS).");
  }

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = (process.env.SMTP_SECURE === "true") || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function sendOTPEmail(toEmail, otp) {
  const transporter = await createTransporter();

  if (process.env.NODE_ENV !== "production") {
    const { user } = pickCreds();
    console.debug("mailer: using email user:", user ? `${user[0]}***${user.slice(-3)}` : "ethereal");
  }

  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@example.com";

  const mailOptions = {
    from: `"ShopRecs" <${fromAddress}>`,
    to: toEmail,
    subject: "Password Reset OTP",
    html: `
      <h2>Password Reset Request</h2>
      <p>Your OTP is:</p>
      <h1>${otp}</h1>
      <p>This OTP is valid for <b>10 minutes</b>.</p>
      <p>Do not share this OTP with anyone.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    return {
      success: true,
      previewUrl,                         // ethereal preview URL (if any)
      ...(process.env.NODE_ENV !== "production" ? { otp } : {})
    };
  } catch (err) {
    console.error("sendMail error:", err);
    // return success:false so caller knows email didn't actually go out
    if (process.env.NODE_ENV !== "production") {
      // return useful info for dev/testing (don't do this in prod)
      return { success: false, error: err.message, otp };
    }
    throw err; // production -> let caller handle 500
  }
}