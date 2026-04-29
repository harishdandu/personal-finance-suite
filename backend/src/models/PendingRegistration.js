import mongoose from 'mongoose'

const PendingRegistrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)

export const PendingRegistration = mongoose.model('PendingRegistration', PendingRegistrationSchema)
