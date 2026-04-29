import nodemailer from 'nodemailer'
import { config } from '../config.js'

let transporter = null

function isConfigured() {
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass)
}

export function getMailTransporter() {
  if (!isConfigured()) return null
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  })
  return transporter
}

export async function sendOtpEmail({ to, otp }) {
  const t = getMailTransporter()
  if (!t) {
    // Dev fallback when SMTP is not configured.
    console.log(`[OTP DEV] ${to} -> ${otp}`)
    return
  }

  try {
    await t.sendMail({
      from: config.smtpFrom,
      to,
      subject: `${config.appName}: verify your email`,
      text: `Your verification OTP is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your verification OTP is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
    })
  } catch (err) {
    // Keep auth flow usable in dev even if SMTP creds are invalid.
    console.error('[OTP MAIL ERROR]', err?.message || err)
    console.log(`[OTP DEV] ${to} -> ${otp}`)
  }
}
