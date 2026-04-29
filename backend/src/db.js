import mongoose from 'mongoose'
import { config } from './config.js'

let cachedConnection = null

export async function connectDb() {
  if (cachedConnection) {
    return cachedConnection
  }
  cachedConnection = await mongoose.connect(config.mongoUri)
  return cachedConnection
}
