import { useMemo, useState } from 'react'
import { Star, MapPin, Calendar, User, TrendingUp, TrendingDown } from 'lucide-react'
import { AgentNote, getCurrentWeek } from '../../../firebase/agentNotes'
import { CITIES } from '../../../firebase/constants'

interface AdminNotesTabProps {
  agentNotes: AgentNote[]
  users: any[]
}

const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent',
  chauffeur: 'Chauffeur',
  livreur: 'Livreur',
  aide_agent: 'Aide Agent',
  pointeur: 'Pointeur',
  caissier: 'Caissier',
  pointeur_encaisseur: 'Pointeur-Encaisseur'
}

export default function AdminNotesTab({ agentNotes, users }: AdminNotesTabProps) {
  const [cityFilter, setCityFilter] = useState('Toutes')
  const [weekFilter, setWeekFilter] = useState(getCurrentWeek())
  const [roleFilter, setRoleFilter] = useState('all')

  // Semaines disponibles
  const availableWeeks = useMemo(() => {
    const weeks = new Set(agentNotes.map(n => n.week))
    return Array.from(weeks).sort().reverse()
  }, [agentNotes])

  // Notes filtrées
  const filteredNotes = useMemo(() => {
    return agentNotes.filter(n => {
      if (cityFilter !== 'Toutes' && n.city !== cityFilter) return false
      if (weekFilter !== 'all' && n.week !== weekFilter) return false
      if (roleFilter !== 'all' && n.agentRole !== roleFilter) return false
      return true
    })
  }, [agentNotes, cityFilter, weekFilter, roleFilter])

  // Statistiques globales
  const stats = useMemo(() => {
    if (filteredNotes.length === 0) return { moyenne: 0, total: 0, excellent: 0, bon: 0, moyen: 0, faible: 0 }

    const moyenne = filteredNotes.reduce((sum, n) => sum + n.note, 0) / filteredNotes.length
    const excellent = filteredNotes.filter(n => n.note >= 8).length
    const bon = filteredNotes.filter(n => n.note >= 6 && n.note < 8).length
    const moyen = filteredNotes.filter(n => n.note >= 4 && n.note < 6).length
    const faible = filteredNotes.filter(n => n.note < 4).length

    return { moyenne, total: filteredNotes.length, excellent, bon, moyen, faible }
  }, [filteredNotes])

  // Stats par ville
  const cityStats = useMemo(() => {
    return CITIES.map(city => {
      const cityNotes = filteredNotes.filter(n => n.city === city)
      if (cityNotes.length === 0) return null
      const moyenne = cityNotes.reduce((sum, n) => sum + n.note, 0) / cityNotes.length
      return { city, moyenne, count: cityNotes.length }
    }).filter(Boolean)
  }, [filteredNotes])

  const getRoleLabel = (role: string) => {
    return ROLE_LABELS[role] || role
  }

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      agent: 'bg-blue-50 text-blue-700',
      chauffeur: 'bg-orange-50 text-orange-700',
      livreur: 'bg-orange-50 text-orange-700',
      aide_agent: 'bg-purple-50 text-purple-700',
      pointeur: 'bg-teal-50 text-teal-700',
      caissier: 'bg-emerald-50 text-emerald-700',
    }
    return colors[role] || 'bg-gray-50 text-gray-700'
  }

  const getNoteColor = (note: number) => {
    if (note >= 8) return 'text-green-600 bg-green-50'
    if (note >= 6) return 'text-blue-600 bg-blue-50'
    if (note >= 4) return 'text-orange-600 bg-orange-50'
    return 'text-red-600 bg-red-50'
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <Star className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">Notes des agents</h2>
            <p className="text-white/90 text-sm mt-1">Suivi des évaluations par semaine et par agence</p>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {/* Ville */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ville</label>
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="Toutes">Toutes les villes</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Semaine */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Semaine</label>
            <select
              value={weekFilter}
              onChange={e => setWeekFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="all">Toutes les semaines</option>
              {availableWeeks.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          {/* Rôle */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Rôle</label>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="all">Tous les rôles</option>
              {['agent', 'chauffeur', 'livreur', 'aide_agent', 'pointeur', 'caissier'].map(r => (
                <option key={r} value={r}>{getRoleLabel(r)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl p-4 text-white text-center">
          <p className="text-3xl font-black">{stats.moyenne.toFixed(1)}</p>
          <p className="text-xs font-medium opacity-90 mt-1">Moyenne</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-gray-800">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-1">Total notes</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-center border border-green-100">
          <p className="text-2xl font-black text-green-600">{stats.excellent}</p>
          <p className="text-xs text-green-700 mt-1">Excellents (≥8)</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center border border-blue-100">
          <p className="text-2xl font-black text-blue-600">{stats.bon}</p>
          <p className="text-xs text-blue-700 mt-1">Bons (6-8)</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 text-center border border-orange-100">
          <p className="text-2xl font-black text-orange-600">{stats.moyen}</p>
          <p className="text-xs text-orange-700 mt-1">Moyens (4-6)</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 text-center border border-red-100">
          <p className="text-2xl font-black text-red-600">{stats.faible}</p>
          <p className="text-xs text-red-700 mt-1">Faibles (&lt;4)</p>
        </div>
      </div>

      {/* Stats par ville */}
      {cityFilter === 'Toutes' && cityStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-600" />
            Performance par ville
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cityStats.map((stat: any) => (
              <div key={stat.city} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-amber-600">{stat.moyenne.toFixed(1)}/10</p>
                <p className="text-xs text-gray-600 font-medium mt-1">{stat.city}</p>
                <p className="text-xs text-gray-400 mt-0.5">{stat.count} note(s)</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste des notes */}
      {filteredNotes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucune note trouvée</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Agent</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Ville</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Semaine</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Note</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Commentaire</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase">Évalué par</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredNotes.map(note => (
                  <tr key={note.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                          {note.agentName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{note.agentName}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${getRoleColor(note.agentRole)}`}>
                            {getRoleLabel(note.agentRole)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {note.city}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {note.week}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold ${getNoteColor(note.note)}`}>
                        <Star className="w-4 h-4 fill-current" />
                        {note.note}/10
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {note.comment ? (
                        <p className="text-sm text-gray-600 italic max-w-xs truncate">"{note.comment}"</p>
                      ) : (
                        <span className="text-sm text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {note.createdByName}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
