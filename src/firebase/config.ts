import app from './appCore'
import { db } from './db'
import { storage } from './storage'
export { auth, authSecondary, authReady } from './auth'
export { db, storage }

export default app
