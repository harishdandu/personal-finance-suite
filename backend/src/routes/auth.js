import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { User } from '../models/User.js'
import { PendingRegistration } from '../models/PendingRegistration.js'
import { sendOtpEmail } from '../services/mail.js'

const router = express.Router()

function emailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase())
}

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function signUser(user) {
  const token = jwt.sign(
    { sub: user._id.toString(), email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  )
  return {
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
  }
}

router.post('/register/request-otp', async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' })
  }
  if (!emailValid(email)) {
    return res.status(400).json({ message: 'Invalid email address.' })
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' })
  }

  const exists = await User.findOne({ email }).lean()
  if (exists) {
    return res.status(409).json({ message: 'Email already registered. Please login.' })
  }

  const otp = makeOtp()
  const passwordHash = await bcrypt.hash(password, 10)
  const otpHash = await bcrypt.hash(otp, 10)
  const otpExpiresAt = new Date(Date.now() + config.otpTtlMs)

  await PendingRegistration.findOneAndUpdate(
    { email },
    { name, email, passwordHash, otpHash, otpExpiresAt },
    { upsert: true, new: true },
  )

  await sendOtpEmail({ to: email, otp })

  return res.json({ message: 'OTP sent to email.' })
})

router.post('/register/verify-otp', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const otp = String(req.body?.otp || '').trim()
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' })

  const pending = await PendingRegistration.findOne({ email })
  if (!pending) return res.status(404).json({ message: 'No pending registration found.' })
  if (!pending.otpExpiresAt || pending.otpExpiresAt.getTime() < Date.now()) {
    await PendingRegistration.deleteOne({ _id: pending._id })
    return res.status(410).json({ message: 'OTP expired. Please request a new one.' })
  }

  const ok = await bcrypt.compare(otp, pending.otpHash)
  if (!ok) return res.status(401).json({ message: 'Invalid OTP.' })

  const existing = await User.findOne({ email }).lean()
  if (existing) {
    await PendingRegistration.deleteOne({ _id: pending._id })
    return res.status(409).json({ message: 'Email already registered. Please login.' })
  }

  const user = await User.create({
    name: pending.name,
    email: pending.email,
    passwordHash: pending.passwordHash,
  })
  await PendingRegistration.deleteOne({ _id: pending._id })

  return res.json(signUser(user))
})

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  const user = await User.findOne({ email })
  if (!user) return res.status(401).json({ message: 'Invalid credentials.' })

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return res.status(401).json({ message: 'Invalid credentials.' })

  return res.json(signUser(user))
})

export default router
