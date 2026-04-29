import express from 'express'
import multer from 'multer'
import mongoose from 'mongoose'
import { requireAuth } from '../middleware/auth.js'
import { ProofRecord } from '../models/ProofRecord.js'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
})

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.authUser.id)
    const rows = await ProofRecord.find({ userId })
      .sort({ createdAt: -1 })
      .select('_id categoryId categoryLabel amount fileName mimeType fileSize createdAt fileData')
      .lean()

    return res.json({
      records: rows.map((r) => ({
        ...(function () {
          const fileDataBase64 = Buffer.isBuffer(r.fileData)
            ? r.fileData.toString('base64')
            : r?.fileData?.buffer
              ? Buffer.from(r.fileData.buffer).toString('base64')
              : ''
          const mimeType = r.mimeType || 'application/octet-stream'
          return {
            id: r._id?.toString?.() || String(r._id || ''),
            categoryId: r.categoryId,
            categoryLabel: r.categoryLabel,
            amount: r.amount,
            fileName: r.fileName,
            mimeType,
            fileSize: r.fileSize,
            createdAt: r.createdAt,
            fileData: fileDataBase64,
            fileDataUrl: fileDataBase64 ? `data:${mimeType};base64,${fileDataBase64}` : '',
          }
        })(),
      })),
    })
  } catch {
    return res.status(500).json({ message: 'Could not load proof records.' })
  }
})

router.post('/', requireAuth, upload.single('proofFile'), async (req, res) => {
  try {
    const amount = Number(req.body?.amount || 0)
    const categoryId = String(req.body?.categoryId || '').trim()
    const categoryLabel = String(req.body?.categoryLabel || '').trim()

    let fileName = ''
    let mimeType = ''
    let fileBuffer = null
    let fileSize = 0

    if (req.file) {
      fileName = req.file.originalname || 'proof'
      mimeType = req.file.mimetype || 'application/octet-stream'
      fileBuffer = req.file.buffer
      fileSize = req.file.size || 0
    } else {
      const base64Raw = String(req.body?.fileBase64 || '').trim()
      fileName = String(req.body?.fileName || 'proof').trim() || 'proof'
      mimeType = String(req.body?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream'
      if (base64Raw) {
        const cleaned = base64Raw.replace(/^data:[^;]+;base64,/, '')
        fileBuffer = Buffer.from(cleaned, 'base64')
        fileSize = fileBuffer.length
      }
    }

    if (!fileBuffer || fileSize <= 0) return res.status(400).json({ message: 'Proof file is required.' })
    if (!categoryId || !categoryLabel) return res.status(400).json({ message: 'Category is required.' })
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Valid amount is required.' })

    const userId = new mongoose.Types.ObjectId(req.authUser.id)
    const record = await ProofRecord.create({
      userId,
      categoryId,
      categoryLabel,
      amount: Math.round(amount),
      fileName,
      mimeType,
      fileSize,
      fileData: fileBuffer,
    })

    return res.json({
      id: record._id.toString(),
      message: 'Proof saved successfully.',
      record: {
        categoryId: record.categoryId,
        categoryLabel: record.categoryLabel,
        amount: record.amount,
        fileName: record.fileName,
        createdAt: record.createdAt,
      },
    })
  } catch (e) {
    return res.status(500).json({ message: 'Could not save proof record.' })
  }
})

router.get('/:id/file', requireAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.authUser.id)
    const id = String(req.params.id || '')
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid proof id.' })

    const record = await ProofRecord.findOne({ _id: id, userId })
      .select('fileName mimeType fileData')
      .lean()
    if (!record) return res.status(404).json({ message: 'Proof not found.' })

    res.setHeader('Content-Type', record.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(record.fileName || 'proof')}"`)
    return res.send(record.fileData)
  } catch {
    return res.status(500).json({ message: 'Could not read proof file.' })
  }
})

export default router
