import { useEffect, useRef, useState } from 'react'

/**
 * ⌨️ Écran « programmeur au travail » : du code s'écrit caractère par caractère, en boucle (décoratif, aucune
 * donnée réelle). Affiché à côté du message « plateforme occupée » (MaintenanceOverlay).
 */
const SNIPPETS = [
  "// 🚧 Maintenance BG Express — mise à jour de la plateforme",
  "import { computeCaisseView } from './agencyCaisseRules'",
  "",
  "async function verifierCaisse(agence: string) {",
  "  const vue = computeCaisseView({ city: agence, datePreset: 'week' })",
  "  console.log(`✔ ${agence} : ${vue.collectesParJour.length} journées`)",
  "  return vue.soldeCaisseGlobal",
  "}",
  "",
  "for (const ville of ['Casablanca', 'Marrakech', 'Agadir', 'Ait Melloul']) {",
  "  await verifierCaisse(ville)",
  "}",
  "",
  "// 🔒 Règles de sécurité Firestore",
  "match /caisseEntries/{id} {",
  "  allow read: if isAdmin() || resource.data.city == userCity();",
  "}",
  "",
  "$ npm run build",
  "✓ 2307 modules transformés",
  "✓ construit en 21.4 s",
  "$ firebase deploy --only hosting",
  "i  déploiement en cours…",
  "✔ Déploiement terminé !",
  "",
  "// ⚡ Optimisation des requêtes",
  "const q = query(collection(db, 'parcels'),",
  "  where('destinationCity', '==', ville),",
  "  where('isArchived', '==', false),",
  "  orderBy('createdAt', 'desc'), limit(50))",
  "",
  "test('versement sans doublon', async () => {",
  "  await expect(verser(['1095342'])).rejects.toThrow('Déjà versé')",
  "})",
  "✓ 198 tests réussis",
  "",
]
const MAX_LINES = 22

export default function LiveCodingPanel({ className = '', compact = false }: Readonly<{ className?: string; compact?: boolean }>) {
  const [lines, setLines] = useState<string[]>([''])
  const pos = useRef({ line: 0, char: 0 })
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const { line, char } = pos.current
      const src = SNIPPETS[line % SNIPPETS.length]
      if (char < src.length) {
        pos.current.char++
        setLines(prev => { const next = prev.slice(); next[next.length - 1] = src.slice(0, char + 1); return next })
        // vitesse de frappe irrégulière, comme un humain
        timer = setTimeout(tick, 18 + Math.random() * 55)
      } else {
        pos.current = { line: line + 1, char: 0 }
        setLines(prev => [...prev, ''].slice(-(compact ? 9 : MAX_LINES)))
        timer = setTimeout(tick, src ? 180 + Math.random() * 320 : 120)
      }
    }
    timer = setTimeout(tick, 300)
    return () => clearTimeout(timer)
  }, [compact])

  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }) }, [lines])

  return (
    <div className={`rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-[#0d1117] text-left ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-white/10">
        <span className="w-3 h-3 rounded-full bg-red-500" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-500" />
        <span className="ml-2 text-[11px] font-mono text-gray-400">bg-express — maintenance.ts</span>
      </div>
      <div ref={boxRef} className={`${compact ? 'h-36 p-2 text-[10px]' : 'h-72 sm:h-96 p-3 text-[11px] sm:text-xs'} overflow-hidden font-mono leading-relaxed`}>
        {lines.map((l, i) => {
          const last = i === lines.length - 1
          const color = l.startsWith('//') ? 'text-gray-500' : l.startsWith('$') ? 'text-sky-300'
            : l.startsWith('✓') || l.startsWith('✔') ? 'text-green-400' : 'text-emerald-200'
          return (
            <div key={i} className={`whitespace-pre ${color}`}>
              {l}{last && <span className="inline-block w-2 h-4 -mb-0.5 bg-emerald-300 animate-pulse align-middle" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
