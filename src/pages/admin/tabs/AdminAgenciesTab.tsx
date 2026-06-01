import { Building2, Download, ShieldCheck, Upload, MapPin } from 'lucide-react'
import { BACKUP_COLLECTIONS } from '../../../firebase/backupCollections'
import { fmt } from '../../../utils/formatNumber'

interface AdminAgenciesTabProps {
  agencyStats: any[]
  periodLabel: string
  exportRows: any
  downloadCsv: (name: string, rows: any[]) => void
  backupBusy: boolean
  backupMessage: any
  importPreview: any
  setImportPreview: (v: any) => void
  handleExportBackup: () => void
  handleBackupFile: (e: any) => void
  handleConfirmImportBackup: () => void
}

export default function AdminAgenciesTab({
  agencyStats,
  periodLabel,
  exportRows,
  downloadCsv,
  backupBusy,
  backupMessage,
  importPreview,
  setImportPreview,
  handleExportBackup,
  handleBackupFile,
  handleConfirmImportBackup,
}: AdminAgenciesTabProps) {
  return (
    <div className="mt-4 space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Building2 className="w-5 h-5 text-cyan-600" />
        <div>
          <h2 className="font-black text-gray-800">Agences du réseau</h2>
          <p className="text-xs text-gray-400">{periodLabel} · flux entrants, sortants, RETOUR FOND et responsables</p>
        </div>
        <button onClick={() => downloadCsv('agences', exportRows.agences)}
          className="ml-auto inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex-1">
            <h3 className="font-black text-gray-800 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" /> Sauvegarde complète des données
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Export JSON complet de Firestore, puis import en mode fusion. L'import ne supprime pas les données existantes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {BACKUP_COLLECTIONS.map((name: string) => (
                <span key={name} className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-lg font-semibold">
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 min-w-60">
            <button onClick={handleExportBackup} disabled={backupBusy}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-3 rounded-xl transition">
              <Download className="w-4 h-4" /> Exporter JSON
            </button>
            <label className={`inline-flex items-center justify-center gap-2 text-sm font-bold px-4 py-3 rounded-xl transition cursor-pointer ${
              backupBusy ? 'bg-gray-100 text-gray-400 pointer-events-none' : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}>
              <Upload className="w-4 h-4" /> Importer JSON
              <input type="file" accept="application/json,.json" onChange={handleBackupFile} className="hidden" />
            </label>
          </div>
        </div>
        {backupMessage && (
          <div className={`mt-4 text-sm font-semibold px-4 py-3 rounded-xl ${
            backupMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
          }`}>
            {backupMessage.text}
          </div>
        )}
        {importPreview && (
          <div className="mt-4 border border-amber-200 bg-amber-50 rounded-2xl p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1">
                <p className="font-bold text-amber-900">Confirmer l'import : {importPreview.fileName}</p>
                <p className="text-xs text-amber-700 mt-1">
                  Mode fusion : les documents existants sont mis a jour, les nouveaux sont ajoutes, aucune suppression automatique.
                </p>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {Object.entries(importPreview.counts).map(([name, count]: [string, any]) => (
                    <div key={name} className="bg-white/80 border border-amber-100 rounded-xl px-3 py-2">
                      <p className="text-[10px] text-amber-600 font-semibold truncate">{name}</p>
                      <p className="text-sm font-black text-amber-900">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex md:flex-col gap-2">
                <button onClick={() => setImportPreview(null)} disabled={backupBusy}
                  className="px-4 py-2.5 rounded-xl border border-amber-200 bg-white text-amber-700 text-sm font-bold hover:bg-amber-100 transition">
                  Annuler
                </button>
                <button onClick={handleConfirmImportBackup} disabled={backupBusy}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-bold transition">
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agencyStats.map(a => {
          const rate = a.incoming.length ? Math.round((a.delivered.length / a.incoming.length) * 100) : 0
          return (
            <div key={a.city} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-cyan-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-gray-800 text-lg flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-cyan-600" /> {a.city}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Responsable : <b>{a.manager?.name || 'Non défini'}</b>
                      {a.manager?.tel ? ` · ${a.manager.tel}` : ''}
                    </p>
                  </div>
                  <span className="bg-white text-cyan-700 text-xs font-bold px-2.5 py-1 rounded-full border border-cyan-100">
                    {a.agents.length} membre(s)
                  </span>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50 rounded-xl py-3">
                    <p className="text-xl font-black text-blue-600">{a.incoming.length}</p>
                    <p className="text-xs text-blue-700">Entrants</p>
                  </div>
                  <div className="bg-indigo-50 rounded-xl py-3">
                    <p className="text-xl font-black text-indigo-600">{a.outgoing.length}</p>
                    <p className="text-xs text-indigo-700">Sortants</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl py-3">
                    <p className="text-xl font-black text-orange-600">{a.active.length}</p>
                    <p className="text-xs text-orange-700">Actifs</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-green-50 rounded-xl py-3">
                    <p className="text-xl font-black text-green-600">{a.delivered.length}</p>
                    <p className="text-xs text-green-700">Livrés</p>
                  </div>
                  <div className="bg-red-50 rounded-xl py-3">
                    <p className="text-xl font-black text-red-600">{a.returned.length}</p>
                    <p className="text-xs text-red-700">Retours</p>
                  </div>
                  <div className="bg-yellow-50 rounded-xl py-3">
                    <p className="text-xl font-black text-yellow-700">{rate}%</p>
                    <p className="text-xs text-yellow-700">Réussite</p>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-xs text-gray-500">RETOUR FOND en attente / collecté</span>
                  <span className="font-bold text-orange-600">{fmt(a.codPending)} DH</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.agents.slice(0, 6).map((u: any) => (
                    <span key={u.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                      {u.name || u.email} · {u.role}
                    </span>
                  ))}
                  {a.agents.length > 6 && <span className="text-xs text-gray-400">+{a.agents.length - 6}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
