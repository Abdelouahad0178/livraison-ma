import { getStorage } from 'firebase/storage'
import app from './appCore'

export const storage = getStorage(app)
