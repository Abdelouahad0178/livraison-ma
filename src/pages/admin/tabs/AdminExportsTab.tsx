import { Download, ShieldCheck, Upload, Package, Wallet, RotateCcw, Building2, AlertTriangle } from 'lucide-react'
import { BACKUP_COLLECTIONS } from '../../../firebase/backupCollections'

interface AdminExportsTabProps {
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

export default function AdminExportsTab({
  periodLabel, exportRows, downloadCsv,
  backupBusy, backupMessage, importPreview, setImportPreview,
  handleExportBackup, handleBackupFile, handleConfirmImportBackup,
}: AdminExportsTabProps) {
  return (
    <div className="mt-4 space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-black text-gray-800 flex items-center gap-2">
          <Download className="w-5 h-5 text-green-600" /> Export Excel
        </h2>
        <p className="text-xs text-gray-400 mt-1">Exports CSV compatibles Excel, basés sur la période Admin actuelle : {periodLabel}.</p>
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
              {BACKUP_COLLECTIONS.map(name => (
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
        {[
          { key: 'expeditions', label: 'Expéditions filtrées', rows: exportRows.expeditions, icon: Package },
          { key: 'cod', label: 'RETOUR FOND / remboursements', rows: exportRows.cod, icon: Wallet },
          { key: 'retours', label: 'Retours', rows: exportRows.retours, icon: RotateCcw },
          { key: 'agences', label: 'Agences', rows: exportRows.agences, icon: Building2 },
          { key: 'alertes', label: 'Alertes', rows: exportRows.alertes, icon: AlertTriangle },
        ].map(item => {
          const Icon = item.icon
          return (
            <div key={item.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800">{item.label}</h3>
                  <p className="text-xs text-gray-400 mt-1">{item.rows.length} ligne(s)</p>
                </div>
              </div>
              <button onClick={() => downloadCsv(item.key, item.rows)} disabled={!item.rows.length}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
                <Download className="w-4 h-4" /> Télécharger
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
