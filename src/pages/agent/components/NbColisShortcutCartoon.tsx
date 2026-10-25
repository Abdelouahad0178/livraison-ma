// 🎬 Petit dessin animé du raccourci « Nb colis » (fenêtre d'aide) : un livreur tape le raccourci
// lettre par lettre ; chaque morceau reconnu prend sa couleur, une flèche part vers la case du
// formulaire qu'il remplit et la bulle explique ce qui se passe. Puis ⏎ Entrée → formulaire rempli.
// Joue en boucle sur plusieurs exemples. Animation 100 % CSS/React (aucun fichier vidéo).
import { useEffect, useRef, useState } from 'react'

type FieldKey = 'nb' | 'port' | 'amount' | 'cash' | 'doc' | 'nature' | 'weight'
interface Seg { text: string; field: FieldKey; value: string; say: string; color: string }
interface Example { title: string; segs: Seg[]; docLabel?: string }

const C = {
  nb: 'bg-blue-100 text-blue-800 border-blue-400',
  port: 'bg-orange-100 text-orange-800 border-orange-400',
  amount: 'bg-amber-100 text-amber-800 border-amber-400',
  cash: 'bg-emerald-100 text-emerald-800 border-emerald-400',
  doc: 'bg-teal-100 text-teal-800 border-teal-400',
  nature: 'bg-pink-100 text-pink-800 border-pink-400',
  weight: 'bg-purple-100 text-purple-800 border-purple-400',
}

const EXAMPLES: Example[] = [
  { title: 'Simple : 3 colis en port payé', segs: [
    { text: '3', field: 'nb', value: '3', say: "D'abord le NOMBRE de colis : 3", color: C.nb },
    { text: 'ps', field: 'port', value: 'Port payé', say: '« ps » = Port payé (espèce)', color: C.port },
    { text: '40', field: 'amount', value: '40 DH', say: 'Puis le MONTANT du port : 40 DH', color: C.amount },
  ] },
  { title: 'Avec retour de fonds en espèces', segs: [
    { text: '2', field: 'nb', value: '2', say: 'Nombre de colis : 2', color: C.nb },
    { text: 'ds', field: 'port', value: 'Port dû', say: '« ds » = Port dû', color: C.port },
    { text: '45', field: 'amount', value: '45 DH', say: 'Montant du port : 45 DH', color: C.amount },
    { text: 'e500', field: 'cash', value: '500 DH', say: '« e » = retour de fonds en ESPÈCES : 500 DH', color: C.cash },
  ] },
  { title: 'Espèces + chèque, palette et poids', docLabel: 'RF chèque', segs: [
    { text: '2', field: 'nb', value: '2', say: 'Nombre de colis : 2', color: C.nb },
    { text: 'ds', field: 'port', value: 'Port dû', say: '« ds » = Port dû', color: C.port },
    { text: '45', field: 'amount', value: '45 DH', say: 'Montant du port : 45 DH', color: C.amount },
    { text: 'e200', field: 'cash', value: '200 DH', say: '« e200 » = 200 DH en espèces…', color: C.cash },
    { text: 'c800', field: 'doc', value: '800 DH', say: '… + « c800 » = un chèque de 800 DH', color: C.doc },
    { text: 'p', field: 'nature', value: 'Palette', say: '« p » = nature Palette (b = Bagages)', color: C.nature },
    { text: 'k8', field: 'weight', value: '8 kg', say: '« k8 » = poids 8 kg', color: C.weight },
  ] },
  { title: 'Compte expéditeur + traite', docLabel: 'RF traite', segs: [
    { text: '1', field: 'nb', value: '1', say: 'Nombre de colis : 1', color: C.nb },
    { text: 'ce', field: 'port', value: 'Compte expéditeur', say: '« ce » = Compte expéditeur (cd = Compte destinataire)', color: C.port },
    { text: '35', field: 'amount', value: '35 DH', say: 'Montant du port : 35 DH', color: C.amount },
    { text: 't3000', field: 'doc', value: '3 000 DH', say: '« t » = une TRAITE de 3 000 DH', color: C.doc },
  ] },
]

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'nb', label: 'Nb colis' },
  { key: 'port', label: 'Type de port' },
  { key: 'amount', label: 'Montant port' },
  { key: 'cash', label: 'RF espèces' },
  { key: 'doc', label: 'RF chèque / traite' },
  { key: 'nature', label: 'Nature' },
  { key: 'weight', label: 'Poids' },
]

const CHAR_MS = 260     // frappe d'une lettre
const SEG_PAUSE = 1500  // pause après chaque morceau (le temps de lire la bulle)

// Phases : typing (seg, nbChars) → enter → done → next example
type Phase = { ex: number; seg: number; chars: number; stage: 'typing' | 'enter' | 'done' }

export default function NbColisShortcutCartoon() {
  const [p, setP] = useState<Phase>({ ex: 0, seg: 0, chars: 0, stage: 'typing' })
  const [playing, setPlaying] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ex = EXAMPLES[p.ex]

  useEffect(() => {
    if (!playing) return
    const next = (): Phase => {
      if (p.stage === 'typing') {
        const seg = ex.segs[p.seg]
        if (p.chars < seg.text.length) return { ...p, chars: p.chars + 1 }
        if (p.seg + 1 < ex.segs.length) return { ...p, seg: p.seg + 1, chars: 1 }
        return { ...p, stage: 'enter' }
      }
      if (p.stage === 'enter') return { ...p, stage: 'done' }
      return { ex: (p.ex + 1) % EXAMPLES.length, seg: 0, chars: 0, stage: 'typing' }
    }
    const n = next()
    // Durée d'AFFICHAGE de l'état courant avant de passer au suivant
    const delay = p.stage === 'typing' && p.chars === 0 ? 1600
      : p.stage === 'typing' && p.chars === ex.segs[p.seg].text.length ? SEG_PAUSE
        : p.stage === 'enter' ? 1300 : p.stage === 'done' ? 2800 : CHAR_MS
    timer.current = setTimeout(() => setP(n), delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [p, playing, ex])

  // Texte tapé et morceaux complets
  const typedSegs = ex.segs.slice(0, p.stage === 'typing' ? p.seg + 1 : ex.segs.length)
  const segDone = (i: number) => p.stage !== 'typing' || i < p.seg || (i === p.seg && p.chars === ex.segs[i].text.length)
  const filled = new Map<FieldKey, Seg>()
  typedSegs.forEach((s, i) => { if (segDone(i)) filled.set(s.field, s) })
  const current = p.stage === 'typing' && p.chars > 0 ? ex.segs[p.seg] : null
  const currentDone = current ? segDone(p.seg) : false
  const say = p.stage === 'enter' ? 'Et maintenant… ⏎ ENTRÉE !'
    : p.stage === 'done' ? '✅ Tout est rempli ! Il ne reste qu\'à cliquer « Créer ».'
      : current && currentDone ? current.say
        : p.chars === 0 ? `Exemple ${p.ex + 1} : ${ex.title}` : 'Je tape…'

  const restart = (i: number) => { setP({ ex: i, seg: 0, chars: 0, stage: 'typing' }); setPlaying(true) }

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-3 overflow-hidden">
      <style>{`
        @keyframes nbcBlink { 50% { opacity: 0 } }
        @keyframes nbcPop { 0% { transform: scale(.4); opacity: 0 } 70% { transform: scale(1.15) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes nbcBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes nbcType { 0%,100% { transform: rotate(-8deg) } 50% { transform: rotate(8deg) translateY(2px) } }
        @keyframes nbcPress { 0%,100% { transform: translateY(0); box-shadow: 0 4px 0 #111827 } 50% { transform: translateY(4px); box-shadow: 0 0 0 #111827 } }
        @keyframes nbcFlash { 0% { background: #bbf7d0 } 100% { background: #ffffff } }
        @keyframes nbcArrow { 0% { opacity: 0; transform: translateY(-6px) } 100% { opacity: 1; transform: translateY(0) } }
        .nbc-pop { animation: nbcPop .35s ease-out both }
        .nbc-bob { animation: nbcBob 1.6s ease-in-out infinite }
        .nbc-type { animation: nbcType .26s ease-in-out infinite; transform-origin: bottom center }
        .nbc-press { animation: nbcPress .5s ease-in-out 2 }
        .nbc-flash { animation: nbcFlash 1.2s ease-out both }
        .nbc-arrow { animation: nbcArrow .35s ease-out both }
      `}</style>

      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-indigo-800">🎬 Dessin animé — Exemple {p.ex + 1}/{EXAMPLES.length}</p>
        <div className="flex items-center gap-1">
          {EXAMPLES.map((_, i) => (
            <button key={i} type="button" onClick={() => restart(i)} title={EXAMPLES[i].title}
              className={`w-6 h-6 rounded-full text-[11px] font-bold ${i === p.ex ? 'bg-indigo-600 text-white' : 'bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}>{i + 1}</button>
          ))}
          <button type="button" onClick={() => setPlaying(v => !v)}
            className="ml-1 px-2 h-6 rounded-full bg-white border border-indigo-200 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50">
            {playing ? '⏸ Pause' : '▶ Lecture'}
          </button>
          <button type="button" onClick={() => restart(p.ex)}
            className="px-2 h-6 rounded-full bg-white border border-indigo-200 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50">↺</button>
        </div>
      </div>

      {/* Personnage + bulle */}
      <div className="flex items-end gap-2 mb-2 min-h-[64px]">
        <div className={`text-4xl select-none ${p.stage === 'typing' && !currentDone && p.chars > 0 ? '' : 'nbc-bob'}`} aria-hidden>
          👷
          <span className={`inline-block text-2xl ${p.stage === 'typing' && !currentDone && p.chars > 0 ? 'nbc-type' : ''}`}>{p.stage === 'done' ? '👍' : '⌨️'}</span>
        </div>
        <div key={say} className="nbc-pop relative bg-white border-2 border-gray-800 rounded-2xl px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm">
          <span className="absolute -left-2 bottom-3 w-3 h-3 bg-white border-l-2 border-b-2 border-gray-800 rotate-45" />
          {say}
        </div>
      </div>

      {/* Champ Nb colis animé */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-white border-2 border-blue-400 rounded-xl px-3 py-2 font-mono text-xl font-extrabold min-h-[48px] flex items-center flex-wrap gap-0.5">
          {typedSegs.map((s, i) => {
            const txt = p.stage === 'typing' && i === p.seg ? s.text.slice(0, p.chars) : s.text
            if (!txt) return null
            return (
              <span key={i} className={`rounded px-1 border ${segDone(i) ? s.color + ' nbc-pop' : 'border-transparent text-gray-800'}`}>{txt}</span>
            )
          })}
          {p.stage === 'typing' && <span className="w-0.5 h-6 bg-gray-800 ml-0.5" style={{ animation: 'nbcBlink 1s step-end infinite' }} />}
        </div>
        <span className={`px-3 py-2 rounded-lg bg-gray-800 text-white text-sm font-bold select-none ${p.stage === 'enter' ? 'nbc-press' : ''}`}
          style={{ boxShadow: '0 4px 0 #111827' }}>⏎ Entrée</span>
      </div>

      {/* Flèche vers le formulaire */}
      <div className="text-center text-2xl text-indigo-400 leading-none my-1" aria-hidden>
        {current && currentDone ? <span key={`${p.ex}-${p.seg}`} className="nbc-arrow inline-block">⬇</span> : p.stage === 'done' ? '⬇' : '·'}
      </div>

      {/* Formulaire simulé */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}
        className={`gap-1.5 rounded-xl p-2 border border-gray-200 ${p.stage === 'done' ? 'nbc-flash' : 'bg-white'}`}>
        {FIELDS.map(f => {
          const s = filled.get(f.key)
          const isNow = current && currentDone && current.field === f.key
          const label = f.key === 'doc' && ex.docLabel ? ex.docLabel : f.label
          return (
            <div key={f.key} className={`rounded-lg border-2 px-2 py-1 transition-all duration-300 ${s ? s.color : 'border-dashed border-gray-200 bg-gray-50'} ${isNow ? 'ring-4 ring-indigo-300' : ''} min-w-0`}>
              <p className="text-[10px] font-semibold opacity-80 leading-tight">{label}</p>
              <p key={s?.value || 'empty'} className={`text-sm font-extrabold leading-tight truncate ${s ? 'nbc-pop' : 'text-gray-300'}`}>{s ? s.value : '—'}</p>
            </div>
          )
        })}
        <div className={`rounded-lg px-2 py-1 flex items-center justify-center text-sm font-extrabold transition-all ${p.stage === 'done' ? 'bg-green-600 text-white nbc-pop' : 'bg-gray-100 text-gray-300'}`}>
          ✅ Créer
        </div>
      </div>
    </div>
  )
}
