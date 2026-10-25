// ❓ Aide visuelle du raccourci « Nb colis » : schéma fléché d'un exemple découpé morceau par
// morceau, tableau des codes et exemples dont le résultat est calculé par le VRAI analyseur
// (utils/nbColisShortcut) — l'aide ne peut donc pas contredire ce que fait réellement la saisie.
// ⚠️ Rendu dans l'arbre (pas de portail) : index.css masque les div directes de <body> hors #root.
import { lazy, Suspense, useEffect, useState } from 'react'
import { analyzeNbColisShortcut } from '../../../utils/nbColisShortcut'

const NbColisShortcutCartoon = lazy(() => import('./NbColisShortcutCartoon'))

const PORT_LABEL: Record<string, string> = {
  port_du: 'Port dû',
  port_paye: 'Port payé (espèce)',
  port_du_cheque: 'Port dû chèque',
  port_en_compte_expediteur: 'Compte expéditeur',
  port_en_compte_destinataire: 'Compte destinataire',
}

// Schéma : « 2ds45e200c800k8 » découpé
const PARTS: { text: string; label: string; detail: string; cls: string }[] = [
  { text: '2', label: 'Nb colis', detail: '2 colis', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  { text: 'ds', label: 'Type de port', detail: 'Port dû', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  { text: '45', label: 'Montant port', detail: '45 DH', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  { text: 'e200', label: 'RF espèces', detail: '200 DH', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { text: 'c800', label: 'RF chèque', detail: '800 DH', cls: 'bg-teal-100 text-teal-800 border-teal-300' },
  { text: 'k8', label: 'Poids', detail: '8 kg', cls: 'bg-purple-100 text-purple-800 border-purple-300' },
]

const CODES: { group: string; rows: [string, string][] }[] = [
  { group: 'Type de port (obligatoire, juste après le nombre de colis)', rows: [
    ['ds', 'Port dû'], ['ps', 'Port payé (espèce)'], ['dc', 'Port dû chèque'],
    ['ce', 'Compte expéditeur'], ['cd', 'Compte destinataire'],
  ] },
  { group: 'Retour de fonds (facultatif, après le montant du port)', rows: [
    ['e…', 'Espèces (ex. e500)'], ['c…', 'Chèque (ex. c1200)'], ['t…', 'Traite (ex. t3000)'],
    ['e…c… / e…t…', 'Espèces + UN chèque ou UNE traite'],
  ] },
  { group: 'Options (facultatives, à la fin)', rows: [
    ['p', 'Nature Palette'], ['b', 'Nature Bagages'], ['k…', 'Poids en kg (ex. k8)'],
  ] },
]

const EXAMPLES = ['2ds45', '3ps40', '2dc45', '1ce35', '2ds45e500', '2ds45c1200', '2ds45t3000', '2ds45e200c800', '2ds45p', '3ds45c1500k8']

function describe(raw: string): string {
  const a = analyzeNbColisShortcut(raw)
  if (!a || !a.shortcut) return a?.error || '—'
  const s = a.shortcut
  const out = [`${s.nbColis} colis`, `${PORT_LABEL[s.portType] || s.portType} ${s.amount} DH`]
  if (s.cod) {
    const doc = s.cod.serviceType === 'cheque' ? 'chèque' : s.cod.serviceType === 'traite' ? 'traite' : 'espèces'
    out.push(s.cod.codMixed
      ? `RF espèces ${s.cod.codCashAmount} + ${doc} ${s.cod.codAmount} DH`
      : `RF ${doc} ${s.cod.total} DH`)
  }
  if (s.nature) out.push(s.nature)
  if (s.weight) out.push(`${s.weight} kg`)
  return out.join(' · ')
}

export default function NbColisShortcutHelp() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  return (
    <>
      <button type="button" tabIndex={-1} onClick={() => setOpen(true)}
        title="Comment utiliser le raccourci ?"
        className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-4 hover:bg-blue-700 align-middle">
        ? Aide
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-3" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Aide raccourci Nb colis"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-5 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-gray-800">⚡ Raccourci de saisie « Nb colis »</h3>
                <p className="text-xs text-gray-500">Tapez tout dans le champ <b>Nb colis</b> puis appuyez sur <b>Entrée</b> : le formulaire se remplit tout seul.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-100 text-lg leading-none">✕</button>
            </div>

            {/* 🎬 Dessin animé */}
            <Suspense fallback={<div className="h-64 rounded-xl bg-indigo-50 animate-pulse" />}>
              <NbColisShortcutCartoon />
            </Suspense>

            {/* Schéma fléché */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">Exemple : on tape <span className="font-mono bg-white border rounded px-1">2ds45e200c800k8</span> puis Entrée</p>
              <div className="flex flex-wrap items-start justify-center gap-1.5">
                {PARTS.map(p => (
                  <div key={p.text} className="flex flex-col items-center min-w-[64px]">
                    <span className={`font-mono text-lg font-extrabold px-2.5 py-1 rounded-lg border-2 ${p.cls}`}>{p.text}</span>
                    <span className="text-gray-400 text-lg leading-none my-0.5">↓</span>
                    <span className="text-[11px] font-bold text-gray-700 text-center leading-tight">{p.label}</span>
                    <span className="text-[11px] text-gray-500 text-center leading-tight">{p.detail}</span>
                  </div>
                ))}
                <div className="flex flex-col items-center min-w-[64px]">
                  <span className="font-mono text-sm font-extrabold px-2.5 py-1.5 rounded-lg border-2 bg-gray-800 text-white border-gray-800">⏎ Entrée</span>
                  <span className="text-gray-400 text-lg leading-none my-0.5">↓</span>
                  <span className="text-[11px] font-bold text-gray-700 text-center leading-tight">Valider</span>
                  <span className="text-[11px] text-gray-500 text-center leading-tight">→ bouton Créer</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-center text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                ➜ Résultat : <b>{describe('2ds45e200c800k8')}</b>
              </p>
            </div>

            {/* Ordre */}
            <p className="text-xs text-gray-600 text-center">
              Ordre à respecter : <b className="text-blue-700">nb colis</b> → <b className="text-orange-700">port</b> → <b className="text-amber-700">montant</b> → <b className="text-emerald-700">retour de fonds</b> → <b className="text-purple-700">p / b / k</b>
            </p>

            {/* Codes */}
            <div className="grid sm:grid-cols-3 gap-2">
              {CODES.map(g => (
                <div key={g.group} className="rounded-xl border border-gray-200 p-2.5">
                  <p className="text-[11px] font-bold text-gray-700 mb-1.5 leading-tight">{g.group}</p>
                  <ul className="space-y-1">
                    {g.rows.map(([code, label]) => (
                      <li key={code} className="flex items-center gap-1.5 text-xs">
                        <span className="font-mono font-bold bg-gray-100 border border-gray-200 rounded px-1.5 min-w-[34px] text-center">{code}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-gray-700">{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Exemples */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <p className="text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 border-b border-gray-200">Exemples</p>
              <ul className="divide-y divide-gray-100">
                {EXAMPLES.map(ex => (
                  <li key={ex} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="font-mono font-bold text-blue-700 min-w-[110px]">{ex}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-gray-700">{describe(ex)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <ul className="text-[11px] text-gray-500 space-y-0.5 list-disc pl-4">
              <li>Majuscules, espaces et virgule (45,5) acceptés ; le clavier sans Maj (é = 2, à = 0…) est corrigé.</li>
              <li>Un chèque et une traite en même temps ne sont pas permis (espèces + un seul document).</li>
              <li>Un simple chiffre (ex. 3) reste une saisie normale du nombre de colis.</li>
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
