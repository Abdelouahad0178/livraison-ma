import { useState, useMemo, useEffect } from 'react'
import { Star, Edit2, Save, X, Calendar } from 'lucide-react'
import { saveAgentNote, getCurrentWeek, AgentNote } from '../../../firebase/agentNotes'

interface NotesAgentsTabProps {
  profile: any
  users: any[]
  agentNotes: AgentNote[]
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

export default function NotesAgentsTab({ profile, users, agentNotes }: NotesAgentsTabProps) {
  const [currentWeek, setCurrentWeek] = useState(getCurrentWeek())
  const [editingAgent, setEditingAgent] = useState<string | null>(null)
  const [noteForm, setNoteForm] = useState({ note: 5, comment: '' })
  const [saving, setSaving] = useState(false)

  // Agents de la ville du chef
  const myAgents = useMemo(() => {
    return users.filter(u =>
      u.city === profile.city &&
      ['agent', 'chauffeur', 'livreur', 'aide_agent', 'pointeur', 'caissier'].includes(u.role)
    )
  }, [users, profile.city])

  // Notes de la semaine courante
  const weekNotes = useMemo(() => {
    const notesMap = new Map<string, AgentNote>()
    agentNotes
      .filter(n => n.week === currentWeek && n.city === profile.city)
      .forEach(n => notesMap.set(n.agentId, n))
    return notesMap
  }, [agentNotes, currentWeek, profile.city])

  const handleEdit = (agent: any) => {
    const existingNote = weekNotes.get(agent.id)
    setEditingAgent(agent.id)
    setNoteForm({
      note: existingNote?.note ?? 5,
      comment: existingNote?.comment || '',
    })
  }

  const handleSave = async (agent: any) => {
    setSaving(true)
    try {
      await saveAgentNote({
        agentId: agent.id,
        agentName: agent.name || '',
        agentRole: agent.role,
        city: profile.city,
        week: currentWeek,
        note: noteForm.note,
        comment: noteForm.comment,
        createdBy: profile.uid || '',
        createdByName: profile.name || '',
      })
      setEditingAgent(null)
    } catch (err) {
      console.error('Erreur sauvegarde note:', err)
      alert('Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <Star className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">Notes des agents</h2>
            <p className="text-white/90 text-sm">Évaluez les performances de vos agents chaque semaine</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 bg-white/10 rounded-xl px-4 py-2 w-fit">
          <Calendar className="w-4 h-4" />
          <span className="font-semibold">Semaine : {currentWeek}</span>
        </div>
      </div>

      {/* Liste des agents */}
      {myAgents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun agent dans votre agence</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {myAgents.map(agent => {
            const note = weekNotes.get(agent.id)
            const isEditing = editingAgent === agent.id

            return (
              <div key={agent.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {agent.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>

                  {/* Info agent */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-800 truncate">{agent.name}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleColor(agent.role)}`}>
                        {getRoleLabel(agent.role)}
                      </span>
                      {agent.code && (
                        <span className="text-xs text-gray-400 font-mono">{agent.code}</span>
                      )}
                    </div>

                    {/* Formulaire de note */}
                    {isEditing ? (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-2">
                            Note : {noteForm.note}/10
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.5"
                            value={noteForm.note}
                            onChange={e => setNoteForm(f => ({ ...f, note: parseFloat(e.target.value) }))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                          <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>0</span>
                            <span>5</span>
                            <span>10</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Commentaire (optionnel)</label>
                          <textarea
                            value={noteForm.comment}
                            onChange={e => setNoteForm(f => ({ ...f, comment: e.target.value }))}
                            placeholder="Ex: Excellent travail cette semaine..."
                            className="w-full border border-gray-200 rounded-xl p-2 text-sm focus:border-amber-500 focus:outline-none resize-none"
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSave(agent)}
                            disabled={saving}
                            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition disabled:opacity-50"
                          >
                            <Save className="w-4 h-4" />
                            {saving ? 'Enregistrement...' : 'Enregistrer'}
                          </button>
                          <button
                            onClick={() => setEditingAgent(null)}
                            disabled={saving}
                            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl transition"
                          >
                            <X className="w-4 h-4" />
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : note ? (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 10 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < note.note
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-lg font-bold text-amber-600">{note.note}/10</span>
                        </div>
                        {note.comment && (
                          <p className="text-sm text-gray-600 italic bg-gray-50 rounded-lg p-2">
                            "{note.comment}"
                          </p>
                        )}
                        <button
                          onClick={() => handleEdit(agent)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          Modifier
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(agent)}
                        className="mt-3 flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-semibold"
                      >
                        <Star className="w-4 h-4" />
                        Noter cet agent
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
