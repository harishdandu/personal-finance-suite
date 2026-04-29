import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) return res.status(401).json({ message: 'Missing auth token.' })

  try {
    const payload = jwt.verify(match[1], config.jwtSecret)
    req.authUser = {
      id: String(payload.sub || ''),
      email: String(payload.email || ''),
      name: String(payload.name || ''),
    }
    if (!req.authUser.id) return res.status(401).json({ message: 'Invalid auth token.' })
    return next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired auth token.' })
  }
}
