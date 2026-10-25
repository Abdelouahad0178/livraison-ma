import app from './appCore'
import { db } from './db'
export { auth, authSecondary, authReady } from './auth'
// ⚡ Le stockage de fichiers (firebase/storage, ~33 Ko) n'est plus chargé au démarrage : seul l'envoi d'une photo de
// profil s'en sert — il l'importe à la demande (src/firebase/storage.ts).
export { db }

export default app
