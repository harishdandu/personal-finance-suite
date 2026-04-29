import mongoose from 'mongoose'

const ProofRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categoryId: { type: String, required: true, trim: true },
    categoryLabel: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true, min: 1 },
    fileData: { type: Buffer, required: true },
  },
  { timestamps: true },
)

export const ProofRecord = mongoose.model('ProofRecord', ProofRecordSchema)
