import { useMemo } from 'react'
import { Banknote, FileText, Search, Wallet, X } from 'lucide-react'
import { fmt } from '../../../utils/formatNumber'

const currentSalaryMonth = () => new Date().toISOString().slice(0, 7)

export default function AdminEmployeesTab({
  users,
  roleFilter,
  setRoleFilter,
  userSearch,
  setUserSearch,
  roles,
  caisseEntries,
  openSalaryPayment,
  setUserEditTab,
  setUserEdit,
  rhRequests,
  onCompleteRhRequest,
}: any) {
  const filteredEmployees = useMemo(() =>
    users
      .filter((u: any) => u.role !== 'admin')
      .filter((u: any) => roleFilter === 'Tous' || u.role === roleFilter)
      .filter((u: any) => !userSearch || [u.name, u.city, u.code, u.cin, u.cnss]
        .some(v => v?.toLowerCase().includes(userSearch.toLowerCase())))
  , [users, roleFilter, userSearch])

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            placeholder="Rechercher un employe..."
            className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent"
          />
          {userSearch && (
            <button onClick={() => setUserSearch('')}>
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: 'Tous', label: 'Tous' },
            { key: 'agent', label: 'Agents' },
            { key: 'chauffeur', label: 'Chauffeurs' },
            { key: 'caissier', label: 'Caissiers' },
            { key: 'directeur', label: 'Directeurs' },
            { key: 'salarie', label: 'Salaries' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRoleFilter(key)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${roleFilter === key ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEmployees.map((u: any) => {
            const role = roles.find((r: any) => r.key === u.role)
            const month = currentSalaryMonth()
            const salaryBase = parseFloat(u.salaire || 0) || 0
            const pendingRhAdvances = (rhRequests || []).filter((r: any) =>
              r.source === 'rh' && r.status === 'pending' && r.paymentKind === 'avance'
              && r.salaryMonth === month
              && (r.staffId === u.id || r.staffName === u.name)
            )
            const pendingRhSalaries = (rhRequests || []).filter((r: any) =>
              r.source === 'rh' && r.status === 'pending' && r.paymentKind === 'salaire'
              && r.salaryMonth === month
              && (r.staffId === u.id || r.staffName === u.name)
            )
            const salaryPaid = caisseEntries
              .filter((e: any) => e.category === 'salaire'
                && e.salaryMonth === month
                && (e.staffId === u.id || (!e.staffId && e.staffName === u.name)))
              .reduce((sum: any, e: any) => sum + (parseFloat(e.amount || 0) || 0), 0)
            const salaryAdvance = caisseEntries
              .filter((e: any) => e.category === 'avance'
                && e.salaryMonth === month
                && (e.staffId === u.id || (!e.staffId && e.staffName === u.name)))
              .reduce((sum: any, e: any) => sum + (parseFloat(e.amount || 0) || 0), 0)
            const remainingSalary = Math.max(0, salaryBase - salaryPaid - salaryAdvance)

            return (
              <div key={u.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="flex items-center gap-3 p-4 border-b border-gray-50">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${role?.badge.split(' ')[0] || 'bg-gray-100'}`}>
                    {role?.emoji || ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 truncate">{u.name}</p>
                    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${role?.badge || 'bg-gray-100 text-gray-600'}`}>
                      {role?.label || u.role}
                    </span>
                  </div>
                  {u.city && <span className="text-xs text-gray-400 shrink-0">{u.city}</span>}
                </div>

                <div className="p-4 space-y-2 text-sm flex-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">CIN</span>
                    <span className={`font-mono font-medium ${u.cin ? 'text-gray-700' : 'text-gray-300'}`}>{u.cin || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">CNSS</span>
                    <span className={`font-mono font-medium ${u.cnss ? 'text-gray-700' : 'text-gray-300'}`}>{u.cnss || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Embauche</span>
                    <span className={`font-medium ${u.dateEmbauche ? 'text-gray-700' : 'text-gray-300'}`}>
                      {u.dateEmbauche ? new Date(u.dateEmbauche).toLocaleDateString('fr-MA') : '-'}
                    </span>
                  </div>
                  {u.dateSortie && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Sortie</span>
                      <span className="font-medium text-red-500">{new Date(u.dateSortie).toLocaleDateString('fr-MA')}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">Salaire</span>
                    <span className={`font-bold ${u.salaire ? 'text-green-600' : 'text-gray-300'}`}>
                      {u.salaire ? `${u.salaire} DH/mois` : '-'}
                    </span>
                  </div>
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Paye ce mois</span>
                      <span className="font-bold text-blue-600">{fmt(salaryPaid)} DH</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Reste</span>
                      <span className={`font-bold ${remainingSalary > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(remainingSalary)} DH</span>
                    </div>
                    {salaryAdvance > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Avances</span>
                        <span className="font-bold text-pink-600">{fmt(salaryAdvance)} DH</span>
                      </div>
                    )}
                    {pendingRhAdvances.length > 0 && (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-gray-400 text-xs">Avances en attente</span>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {pendingRhAdvances.map((r: any) => (
                            <button
                              key={r.id}
                              onClick={() => onCompleteRhRequest(r)}
                              className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-lg transition"
                              title="Cliquer pour valider le paiement depuis la caisse"
                            >
                              {Number(r.amount || 0).toLocaleString('fr-MA')} DH ▶ Valider
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {pendingRhSalaries.length > 0 && (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-gray-400 text-xs">Salaire en attente</span>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {pendingRhSalaries.map((r: any) => (
                            <button
                              key={r.id}
                              onClick={() => onCompleteRhRequest(r)}
                              className="text-xs font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded-lg transition"
                              title="Cliquer pour valider le paiement depuis la caisse"
                            >
                              {Number(r.amount || 0).toLocaleString('fr-MA')} DH ▶ Valider
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 pb-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openSalaryPayment(u, 'salaire')}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 text-sm font-semibold transition"
                    >
                      <Banknote className="w-3.5 h-3.5" /> Payer
                    </button>
                    <button
                      onClick={() => openSalaryPayment(u, 'avance')}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 text-sm font-semibold transition"
                    >
                      <Wallet className="w-3.5 h-3.5" /> Avance
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setUserEditTab('hr')
                      setUserEdit({
                        id: u.id,
                        name: u.name || '',
                        role: u.role || 'agent',
                        city: u.city || '',
                        code: u.code || '',
                        tel: u.tel || '',
                        directorPermissions: u.directorPermissions || [],
                        cin: u.cin || '',
                        cnss: u.cnss || '',
                        assurance: u.assurance || '',
                        dateEmbauche: u.dateEmbauche || '',
                        dateSortie: u.dateSortie || '',
                        dateNaissance: u.dateNaissance || '',
                        salaire: u.salaire || '',
                        adresse: u.adresse || '',
                        situationFamiliale: u.situationFamiliale || '',
                        contactUrgence: u.contactUrgence || '',
                        noteRH: u.noteRH || '',
                      })
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-sm font-semibold transition"
                  >
                    <FileText className="w-3.5 h-3.5" /> Ouvrir le dossier RH
                  </button>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
