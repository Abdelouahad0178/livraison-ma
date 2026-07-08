import { X, ChevronDown, Save, Edit2 } from 'lucide-react'
import { CITIES, STATUSES } from '../../../firebase/constants'

interface AdminEditParcelModalProps {
  adminEditModal: any
  setAdminEditModal: (v: any) => void
  handleAdminEditSave: () => void
}

export default function AdminEditParcelModal({
  adminEditModal,
  setAdminEditModal,
  handleAdminEditSave,
}: AdminEditParcelModalProps) {
  if (!adminEditModal) return null

  // Navigation avec Entrée entre les inputs
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const target = e.target as HTMLElement
      const form = target.closest('form')
      if (!form) return

      const focusables = Array.from(
        form.querySelectorAll('input:not([type="hidden"]), select, textarea, button[type="submit"]')
      ).filter((el: any) => !el.disabled && el.offsetParent !== null) as HTMLElement[]

      const currentIndex = focusables.indexOf(target)
      if (currentIndex >= 0 && currentIndex < focusables.length - 1) {
        focusables[currentIndex + 1].focus()
      } else if (currentIndex === focusables.length - 1) {
        // Dernier champ : soumettre le formulaire
        handleAdminEditSave()
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-base">
              <Edit2 className="w-4 h-4 text-purple-600" />
              Modifier expédition — Admin
            </h3>
            <p className="text-xs font-mono text-blue-600 mt-0.5">{adminEditModal.parcel.trackingId}</p>
            <p className="text-xs text-red-500 mt-0.5">⚠️ Modifications enregistrées sous votre responsabilité</p>
          </div>
          <button onClick={() => setAdminEditModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form autoComplete="off" onKeyDown={handleKeyDown} className="overflow-y-auto flex-1 p-5 space-y-5">
          {adminEditModal.error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {adminEditModal.error}</div>
          )}

          {/* Statut & Type */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Statut &amp; Type de service</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Statut</label>
                <div className="relative">
                  <select
                    value={adminEditModal.form.status}
                    onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, status: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:border-purple-400"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type de service</label>
                <div className="relative">
                  <select
                    value={adminEditModal.form.serviceType}
                    onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, serviceType: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:border-purple-400"
                  >
                    {['simple','especes','cheque','traite','retour_bl'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Expéditeur */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Expéditeur</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nom</label>
                <input value={adminEditModal.form.senderName} onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, senderName: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
                <input value={adminEditModal.form.senderTel} onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, senderTel: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ville</label>
                <input value={adminEditModal.form.senderCity} onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, senderCity: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
            </div>
          </div>

          {/* Destinataire */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Destinataire</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nom</label>
                <input value={adminEditModal.form.receiverName} onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, receiverName: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Téléphone</label>
                <input value={adminEditModal.form.receiverTel} onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, receiverTel: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ville</label>
                <input value={adminEditModal.form.receiverCity} onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, receiverCity: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
            </div>
          </div>

          {/* Trajet */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Trajet</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ville origine</label>
                <div className="relative">
                  <select value={adminEditModal.form.originCity} onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, originCity: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:border-purple-400">
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ville destination</label>
                <div className="relative">
                  <select value={adminEditModal.form.destinationCity} onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, destinationCity: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:border-purple-400">
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Colis & Prix */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Colis &amp; Prix</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Poids (kg)</label>
                <input type="number" min="0" step="0.1" value={adminEditModal.form.weight}
                  onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, weight: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nombre de colis</label>
                <input type="number" min="1" step="1" value={adminEditModal.form.nbColis}
                  onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, nbColis: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Prix (DH)</label>
                <input type="number" min="0" step="0.01" value={adminEditModal.form.price}
                  onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, price: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type de port</label>
                <div className="relative">
                  <select
                    value={adminEditModal.form.portType || 'port_paye'}
                    onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, portType: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400 bg-white appearance-none pr-8"
                  >
                    <option value="port_paye">✅ Port payé</option>
                    <option value="port_du">📮 Port dû</option>
                    <option value="port_en_compte">💼 En compte</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">RETOUR FOND (DH)</label>
                <input type="number" min="0" step="0.01" value={adminEditModal.form.codAmount}
                  onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, codAmount: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Nature marchandise</label>
                <input value={adminEditModal.form.natureOfGoods}
                  onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, natureOfGoods: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
            </div>
          </div>

          {/* Pipeline RETOUR FOND */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Pipeline RETOUR FOND</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Statut COD</label>
                <div className="relative">
                  <select value={adminEditModal.form.codStatus}
                    onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, codStatus: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm appearance-none bg-white focus:outline-none focus:border-purple-400">
                    {['pending','collected','not_collected','refused'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Motif retour</label>
                <input value={adminEditModal.form.returnReason}
                  onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, returnReason: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-purple-400" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { key: 'codSentToSource',     label: "COD envoyé à l'agence source" },
                { key: 'codReceivedBySource', label: "COD reçu par l'agence source" },
                { key: 'codSenderPaid',       label: "COD réglé à l'expéditeur" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox"
                    checked={!!adminEditModal.form[key]}
                    onChange={e => setAdminEditModal((m: any) => ({ ...m, form: { ...m.form, [key]: e.target.checked } }))}
                    className="w-4 h-4 rounded accent-purple-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Historique modifications admin */}
          {adminEditModal.parcel.adminChanges?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-1">Historique modifications Admin</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {[...adminEditModal.parcel.adminChanges].reverse().map((ch: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-purple-50 rounded-lg px-3 py-1.5 border border-purple-100">
                    <span className="shrink-0 text-purple-500 font-semibold">🖥️</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-purple-700">{ch.field}</span>
                      <span className="text-gray-500"> : </span>
                      <span className="text-red-500 line-through">{ch.oldValue || '—'}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span className="text-green-700 font-medium">{ch.newValue || '—'}</span>
                    </div>
                    <div className="shrink-0 text-right text-gray-400">
                      <p>{new Date(ch.changedAt).toLocaleDateString('fr-MA')}</p>
                      <p className="text-[10px]">{ch.changedBy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-5 border-t shrink-0 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setAdminEditModal(null)}
            className="py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition text-sm"
          >Annuler</button>
          <button type="button" onClick={handleAdminEditSave} disabled={adminEditModal.loading}
            className="py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {adminEditModal.loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sauvegarde…</>
              : <><Save className="w-4 h-4" /> Enregistrer</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
