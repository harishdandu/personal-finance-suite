import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { connectDb } from './db.js'
import authRoutes from './routes/auth.js'
import proofRoutes from './routes/proofs.js'
import carAdvisorRoutes from './routes/carAdvisor.js'
import fundAdvisorRoutes from './routes/fundAdvisor.js'

const app = express()
app.use(cors({ origin: config.frontendOrigin, credentials: false }))
app.use(express.json({ limit: config.jsonBodyLimit }))
app.use(express.urlencoded({ extended: true, limit: config.jsonBodyLimit }))

// Ensure DB is connected for all API requests (important for serverless)
app.use('/api', async (req, res, next) => {
  try {
    await connectDb()
    next()
  } catch (err) {
    console.error('DB connection failed', err)
    res.status(500).json({ message: 'Database connection failed' })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRoutes)
app.use('/api/proofs', proofRoutes)
app.use('/api/car-advisor', carAdvisorRoutes)
app.use('/api/fund-advisor', fundAdvisorRoutes)

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Backend running on port ${config.port}`)
  })
}

export default app
