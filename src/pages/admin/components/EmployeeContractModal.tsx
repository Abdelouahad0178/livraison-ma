import { FileText, X } from 'lucide-react'

export default function EmployeeContractModal({ contractModal, setContractModal }: any) {
  if (!contractModal) return null

  const { employee, form } = contractModal
  const updateFormField = (field: any, value: any) => {
    setContractModal((current: any) => ({
      ...current,
      form: { ...current.form, [field]: value },
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white sm:rounded-2xl w-full sm:max-w-lg shadow-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center gap-3 p-5 border-b shrink-0 bg-indigo-50">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-800">Contrat de travail</h2>
            <div className="text-xs text-indigo-600 font-medium">{employee.name}</div>
          </div>
          <button onClick={() => setContractModal(null)} className="p-2 hover:bg-white/60 rounded-xl transition">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Type de contrat</label>
            <div className="flex gap-2">
              {['CDI', 'CDD'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateFormField('typeContrat', type)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border transition ${form.typeContrat === type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date de debut</label>
              <input
                type="date"
                value={form.dateDebut}
                onChange={e => updateFormField('dateDebut', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            {form.typeContrat === 'CDD' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date de fin</label>
                <input
                  type="date"
                  value={form.dateFin}
                  onChange={e => updateFormField('dateFin', e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Poste / Fonction</label>
            <input
              value={form.poste}
              onChange={e => updateFormField('poste', e.target.value)}
              placeholder="Ex : Agent de Transit"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Departement</label>
              <input
                value={form.departement}
                onChange={e => updateFormField('departement', e.target.value)}
                placeholder="Exploitation"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Lieu de travail</label>
              <input
                value={form.lieuTravail}
                onChange={e => updateFormField('lieuTravail', e.target.value)}
                placeholder="Casablanca"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Horaires de travail</label>
            <input
              value={form.horaire}
              onChange={e => updateFormField('horaire', e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Salaire brut (DH/mois)</label>
              <input
                type="number"
                min="0"
                value={form.salaireBrut}
                onChange={e => updateFormField('salaireBrut', e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Periode d'essai</label>
              <input
                value={form.periodeEssai}
                onChange={e => updateFormField('periodeEssai', e.target.value)}
                placeholder="45 jours"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Lieu de naissance</label>
              <input
                value={form.lieuNaissance}
                onChange={e => updateFormField('lieuNaissance', e.target.value)}
                placeholder="Casablanca"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Nationalite</label>
              <input
                value={form.nationalite}
                onChange={e => updateFormField('nationalite', e.target.value)}
                placeholder="Marocaine"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Avantages (transport, repas, primes...)</label>
            <input
              value={form.avantages}
              onChange={e => updateFormField('avantages', e.target.value)}
              placeholder="Ex : Indemnite de transport 300 DH/mois"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Convention collective</label>
            <input
              value={form.conventionColl}
              onChange={e => updateFormField('conventionColl', e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
            Conforme au Code du Travail Marocain - Loi n 65-99. Verifiez les donnees avant impression.
          </div>
        </div>

        <div className="px-5 py-4 border-t grid grid-cols-2 gap-3 shrink-0">
          <button
            onClick={() => setContractModal(null)}
            className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
          >
            Annuler
          </button>
          <button
            onClick={async () => {
              const { printEmployeeContract } = await import('../../../utils/printEmployeeContract')
              printEmployeeContract(employee, form)
            }}
            className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" /> Imprimer le contrat
          </button>
        </div>
      </div>
    </div>
  )
}
