/**
 * 💾 Sauvegarde manuelle sur le PC (Admin › « Exporter JSON ») — écriture MORCEAU PAR MORCEAU (06/11/2026).
 *
 * Avant : toute la base en mémoire, puis JSON.stringify(sauvegarde, null, 2) d'un seul bloc. Un navigateur refuse un texte de
 * plus de ≈ 512 Mo (« Invalid string length ») : avec ≈ 70 000 expéditions, l'export échouait ou figeait la page.
 * Maintenant : chaque page lue est aussitôt convertie en petits morceaux (Blob), que le navigateur garde sur le disque.
 *
 * Le fichier reste le MÊME format (firestore-backup-v1, relu par « Importer JSON ») : un seul objet JSON, avec une
 * expédition par ligne au lieu de l'indentation.
 */
const FLUSH_CHARS = 4_000_000

export interface BackupItem { id: string; data: any }

/** Valeur Firestore → valeur enregistrable dans le fichier (dates, références, points GPS gardés reconnaissables). */
export function serializeBackupValue(value: any): any {
  if (value?.toDate && typeof value.toDate === 'function') {
    return { __type: 'timestamp', value: value.toDate().toISOString() }
  }
  if (value instanceof Date) return { __type: 'date', value: value.toISOString() }
  if (Array.isArray(value)) return value.map(serializeBackupValue)
  if (value && typeof value === 'object') {
    // Référence de document / point GPS : jamais parcourus champ par champ (une référence contient toute la connexion Firestore)
    if (typeof value.path === 'string' && value.firestore) return { __type: 'reference', path: value.path }
    if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && typeof value.isEqual === 'function') {
      return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude }
    }
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeBackupValue(nested)]))
  }
  return value
}

// Format du fichier : commun au bouton du site et à la sauvegarde du serveur (functions/cloudBackup.js)
export const backupHeader = (exportedAt: string) => `{"app":"BG Express","schema":"firestore-backup-v1","exportedAt":${JSON.stringify(exportedAt)},"collections":{`
export const backupCollectionStart = (name: string, first: boolean) => `${first ? '' : ','}\n${JSON.stringify(name)}:[`
export const backupDocLine = (item: BackupItem, first: boolean) => `${first ? '' : ','}\n${JSON.stringify(item)}`
export const BACKUP_COLLECTION_END = '\n]'
export const backupFooter = (counts: Record<string, number>, errors: Record<string, string>) => `\n},"counts":${JSON.stringify(counts)},"errors":${JSON.stringify(errors)}}\n`

export function createBackupWriter(exportedAt: string) {
  const parts: Blob[] = []
  let pending = ''
  let chars = 0
  let firstCollection = true
  let firstDoc = true
  const flush = () => { if (pending) { parts.push(new Blob([pending])); pending = '' } }
  const write = (s: string) => {
    pending += s
    chars += s.length
    if (pending.length >= FLUSH_CHARS) flush()
  }
  write(backupHeader(exportedAt))
  return {
    beginCollection(name: string) {
      write(backupCollectionStart(name, firstCollection))
      firstCollection = false
      firstDoc = true
    },
    addDoc(item: BackupItem) {
      write(backupDocLine(item, firstDoc))
      firstDoc = false
    },
    endCollection() { write(BACKUP_COLLECTION_END) },
    /** Taille écrite jusqu'ici (en caractères ≈ octets), pour la progression. */
    get size() { return chars },
    /** Nombre de morceaux gardés (test : le fichier n'est jamais un seul gros bloc). */
    get partsCount() { return parts.length },
    finish(counts: Record<string, number>, errors: Record<string, string>): Blob {
      write(backupFooter(counts, errors))
      flush()
      return new Blob(parts, { type: 'application/json;charset=utf-8' })
    },
  }
}

export interface PagedDoc { id: string; data: any }

/**
 * Lit une collection page par page (reprise après le dernier identifiant). Une page en échec est retentée (coupure réseau
 * pendant un long export) ; si elle échoue encore, l'erreur remonte avec ce qui a déjà été écrit.
 */
export async function readPagesWithRetry(
  fetchPage: (afterId: string | null, pageSize: number) => Promise<PagedDoc[]>,
  onPage: (docs: PagedDoc[]) => void | Promise<void>,
  { pageSize = 500, retries = 3, retryDelayMs = 2000, sleep = (ms: number) => new Promise(r => setTimeout(r, ms)) }: {
    pageSize?: number; retries?: number; retryDelayMs?: number; sleep?: (ms: number) => Promise<unknown>
  } = {},
): Promise<number> {
  let after: string | null = null
  let total = 0
  for (let guard = 0; guard < 100000; guard++) {
    let docs: PagedDoc[] | null = null
    for (let attempt = 0; ; attempt++) {
      try { docs = await fetchPage(after, pageSize); break } catch (err) {
        if (attempt >= retries) throw err
        await sleep(retryDelayMs * (attempt + 1))
      }
    }
    if (docs.length) { await onPage(docs); total += docs.length; after = docs[docs.length - 1].id }
    if (docs.length < pageSize) break
  }
  return total
}

/** Enregistre le fichier sur le PC (dossier Téléchargements du navigateur). */
export function saveBlobToPc(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // ⚠️ Pas de retrait immédiat : le navigateur lit encore ce gros fichier pour le télécharger (sinon « Échec — erreur réseau »)
  setTimeout(() => URL.revokeObjectURL(url), 30 * 60 * 1000)
}

/** Taille lisible : « 412 Mo ». */
export const backupSizeLabel = (n: number) => (n >= 1048576 ? `${Math.round(n / 1048576).toLocaleString('fr-FR')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`)
