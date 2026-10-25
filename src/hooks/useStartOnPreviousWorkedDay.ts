import { useEffect, useState } from 'react'
import { previousWorkedOperationalDays } from '../config/operationalDay'

// Onglets déjà démarrés pendant cette ouverture de la page : au retour, le filtre choisi par l'utilisateur est gardé
const started = new Set<string>()

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * 📅 Démarrage sur la VEILLE TRAVAILLÉE (comme le chef d'agence et le chef d'exploitation, demande du 24/10/2026) :
 * journée d'opération d'hier ; le lundi, le samedi avec le dimanche (« Période » samedi → dimanche, en journées
 * d'opération : samedi 08:00 → lundi 06:00). Une seule fois par onglet et par ouverture de la page.
 * Renvoie `ready` : faux tant que la journée n'est pas appliquée — le chargement doit l'attendre (sinon la
 * période par défaut partirait une fraction de seconde pour rien).
 */
export function useStartOnPreviousWorkedDay(key: string, s: {
  setDatePreset: (p: string) => void
  setOperationalDay: (d: Date | null) => void
  setDateFrom: (v: string) => void
  setDateTo: (v: string) => void
}): boolean {
  const [ready, setReady] = useState(() => started.has(key))
  useEffect(() => {
    if (started.has(key)) { setReady(true); return }
    started.add(key)
    const { from, to } = previousWorkedOperationalDays()
    if (from.getTime() === to.getTime()) {
      s.setOperationalDay(from)
      s.setDatePreset('operational')
    } else {
      s.setDateFrom(ymd(from))
      s.setDateTo(ymd(to))
      s.setDatePreset('custom')
    }
    setReady(true)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return ready
}
