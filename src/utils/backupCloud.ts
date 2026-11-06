/**
 * ☁️ Sauvegarde automatique du serveur (Storage auto-backups/) — règles communes (06/11/2026).
 * Mêmes collections et même format que l'export manuel sur le PC. Compilé pour les Cloud Functions :
 * node scripts/build-functions-shared.mjs → functions/shared/backupCloud.js (utilisé par functions/cloudBackup.js et healthCheck.js).
 */
export { BACKUP_COLLECTIONS } from '../firebase/backupCollections'
export {
  BACKUP_COLLECTION_END, backupCollectionStart, backupDocLine, backupFooter, backupHeader, readPagesWithRetry, serializeBackupValue,
} from './backupFileWriter'

export const BACKUP_FOLDER = 'auto-backups'
export const BACKUP_FILE_PREFIX = `${BACKUP_FOLDER}/backup-bgexpress-`
export const MAX_CLOUD_BACKUPS = 10
/** Une sauvegarde par semaine : au-delà de 8 jours sans nouveau fichier, il y a un problème. */
export const BACKUP_STALE_DAYS = 8
const DAY_MS = 86400000

export const backupFileName = (exportedAt: string) => `${BACKUP_FILE_PREFIX}${exportedAt.replace(/[:.]/g, '-').slice(0, 19)}.json`

/** Rotation : les plus anciens au-delà de `max` (les noms contiennent la date, le tri alphabétique est chronologique). */
export function backupsToDelete(names: string[], max = MAX_CLOUD_BACKUPS): string[] {
  const sorted = names.filter(n => n.startsWith(BACKUP_FILE_PREFIX)).sort()
  return sorted.slice(0, Math.max(0, sorted.length - max))
}

export interface BackupFileInfo { name: string; timeCreated?: string; size?: number | string; documents?: number | string; errors?: number | string }

/** État pour le contrôle de santé : date et âge de la dernière sauvegarde ; `stale` = alerte. */
export function backupStatusOf(files: BackupFileInfo[], nowMs: number, maxDays = BACKUP_STALE_DAYS) {
  const list = files.filter(f => f.name.startsWith(BACKUP_FILE_PREFIX)).sort((a, b) => a.name.localeCompare(b.name))
  const last = list[list.length - 1]
  const at = last?.timeCreated ? Date.parse(last.timeCreated) : NaN
  if (!last || !Number.isFinite(at)) return { count: list.length, lastAt: null, ageDays: null, sizeBytes: 0, documents: null, errors: 0, stale: true }
  const ageDays = Math.floor((nowMs - at) / DAY_MS)
  const errors = Number(last.errors) || 0
  return {
    count: list.length,
    lastAt: new Date(at).toISOString(),
    ageDays,
    sizeBytes: Number(last.size) || 0,
    documents: last.documents === undefined ? null : Number(last.documents),
    errors,
    stale: nowMs - at > maxDays * DAY_MS || errors > 0,
  }
}
