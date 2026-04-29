import dotenv from 'dotenv'

dotenv.config()

export const config = {
  port: Number(process.env.PORT || 8080),
  mongoUri: process.env.MONGO_URI || 'mongodb://mongo:27017/finance_buddy',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  otpTtlMs: Number(process.env.OTP_TTL_MS || 10 * 60 * 1000),
  appName: process.env.APP_NAME || 'Finance Buddy',
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'no-reply@financebuddy.local',
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '16mb',
  aiApiUrl: process.env.AI_API_URL || 'https://api.openai.com/v1',
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
}
