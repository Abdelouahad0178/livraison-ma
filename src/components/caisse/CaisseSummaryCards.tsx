import { Banknote, ChevronDown, Package, TrendingUp } from 'lucide-react'
import { usePersistedOpen } from '../../hooks/usePersistedOpen'
import { fmtFixed as fmtAmt } from '../../utils/formatNumber'

/** Chiffres utilisés (computeCaisseView().filteredStats, src/utils/agencyCaisseRules.ts). */
export interface CaisseSummaryStats {
  portsACollecterCount: number; portsACollecterMontant: number
  portsCollectes: number; portsCollectesMontant: number
  enRetardCount: number
  portsPayesARecevoirCount: number; portsPayesARecevoirMontant: number
  portsPayesRecusCount: number; portsPayesRecusMontant: number
  ramassesRemisCount: number; ramassesRemisMontant: number
}

const exp = (n: number) => `${n} expédition${n > 1 ? 's' : ''}`

/** 💼 « À verser » PAR JOUR DE COLLECTE (Caisse Agence) : ce qui a été collecté ce jour-là et n'est pas encore versé. */
export interface VerserJour {
  days: { key: string; label: string; aVerser: number }[]
  selected: string
  onSelect: (key: string) => void
  montant: number
  /** dont expéditions créées le jour même */
  duJour: number
  /** dont expéditions antérieures : [date d'expédition, montant] */
  anciens: [string, number][]
  /** Tout ce qui reste à verser, toutes journées confondues */
  totalNonVerse: number
  /** ⏳ Ports dus collectés ce jour-là, pas encore reçus par le chef d'agence (non versables) */
  nonRecu?: number
  /** ⏳ Idem, toutes journées confondues */
  totalNonRecu?: number
}

/**
 * 🧾 4 cartes du haut — composant UNIQUE de Caisse Agence (chef d'agence) et de la Collecte du soir
 * (chef d'exploitation) : mêmes chiffres, même présentation (montant en gras, nombre d'expéditions à part).
 * - Ports dus : total = collectés + reste à collecter (dont en retard) ;
 * - Ports payés à ramasser : reçus (chef d'agence, ou remis au chef d'exploitation) / à recevoir ;
 * - À verser : ports dus collectés + ports payés à ramasser reçus (`aVerser`, calculé par la page).
 */
/** 💼 « À verser » détaillé (Collecte du soir) : total sans double comptage + lignes explicatives. */
export interface AVerserDetail { total: number; lines: { label: string; n: number; m: number; hint?: string }[]; note?: string }

export default function CaisseSummaryCards({ stats, aVerser, jour, aVerserDetail, collapseKey }: Readonly<{ stats: CaisseSummaryStats; aVerser: number; jour?: VerserJour; aVerserDetail?: AVerserDetail
  /** Fourni → cartes repliées au démarrage sous une flèche, avec une ligne de résumé (état mémorisé) */
  collapseKey?: string }>) {
  const [open, setOpen] = usePersistedOpen(`cartes:${collapseKey || 'x'}`, !collapseKey)
  const ppRecusN = stats.portsPayesRecusCount + stats.ramassesRemisCount
  const ppRecusM = stats.portsPayesRecusMontant + stats.ramassesRemisMontant
  const ppARecevoirN = Math.max(0, stats.portsPayesARecevoirCount - stats.ramassesRemisCount)
  const ppARecevoirM = Math.max(0, stats.portsPayesARecevoirMontant - stats.ramassesRemisMontant)
  const line = (label: string, n: number, m: number, cls: string) => (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className={cls}>{label}</span>
      <span className="tabular-nums text-right"><b className={cls}>{fmtAmt(m)} DH</b> <span className="text-xs text-gray-500">({exp(n)})</span></span>
    </div>
  )
  const aVerserShown = jour ? jour.montant : aVerserDetail ? aVerserDetail.total : aVerser
  const header = collapseKey ? (
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
      className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left hover:bg-slate-50">
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-black text-slate-800">📊 Chiffres</span>
        <span className="text-blue-800">💰 Ports dus <b className="tabular-nums">{fmtAmt(stats.portsCollectesMontant + stats.portsACollecterMontant)} DH</b> <span className="text-xs text-gray-500">(reste {fmtAmt(stats.portsACollecterMontant)})</span></span>
        <span className="text-indigo-800">📬 Ports payés <b className="tabular-nums">{fmtAmt(ppRecusM + ppARecevoirM)} DH</b></span>
        <span className="text-purple-800">💼 À verser <b className="tabular-nums">{fmtAmt(aVerserShown)} DH</b></span>
        {stats.enRetardCount > 0 && <span className="text-amber-700 font-semibold">⏰ {exp(stats.enRetardCount)} en retard</span>}
      </span>
      <ChevronDown className={`w-5 h-5 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  ) : null
  if (collapseKey && !open) return header
  return (
    <div className="space-y-2">{header}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 💰 Ports dus — total = collectés + reste à collecter (« reste » ≠ total du jour) */}
      <div className="bg-linear-to-br from-blue-50 to-green-50 border border-blue-200 rounded-xl p-4 space-y-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-2 text-sm font-bold text-blue-800"><Package className="w-5 h-5 text-blue-600" /> Ports dus</span>
          <span className="text-right tabular-nums"><b className="text-sm text-blue-900">{fmtAmt(stats.portsCollectesMontant + stats.portsACollecterMontant)} DH</b> <span className="text-xs text-gray-500">({exp(stats.portsCollectes + stats.portsACollecterCount)})</span></span>
        </div>
        {line('Collectés', stats.portsCollectes, stats.portsCollectesMontant, 'text-green-700')}
        {line('Reste à collecter', stats.portsACollecterCount, stats.portsACollecterMontant, 'text-blue-700')}
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-amber-700">dont en retard (&gt; 24 h)</span>
          <span className="text-xs text-amber-700 tabular-nums"><b>{exp(stats.enRetardCount)}</b></span>
        </div>
      </div>

      {/* 📬 Ports payés à ramasser */}
      <div className="bg-linear-to-br from-indigo-50 to-sky-50 border border-indigo-200 rounded-xl p-4 space-y-1.5"
        title="Ports payés à ramasser : au guichet par « En gare - ville » (toutes destinations) et par les livreurs de ramassage">
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-2 text-sm font-bold text-indigo-800"><Banknote className="w-5 h-5 text-indigo-600" /> Ports payés à ramasser</span>
          <span className="text-right tabular-nums"><b className="text-sm text-indigo-900">{fmtAmt(ppRecusM + ppARecevoirM)} DH</b> <span className="text-xs text-gray-500">({exp(ppRecusN + ppARecevoirN)})</span></span>
        </div>
        {line('Reçus', ppRecusN, ppRecusM, 'text-teal-700')}
        {line('À recevoir', ppARecevoirN, ppARecevoirM, 'text-indigo-700')}
      </div>

      {/* 🧮 Total ports = ports dus + ports payés à ramasser (mêmes expéditions que les deux cartes précédentes) */}
      <div className="bg-linear-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="flex items-center gap-2 text-sm font-bold text-amber-800"><TrendingUp className="w-5 h-5 text-amber-600" /> Total ports</span>
          <span className="text-right tabular-nums"><b className="text-sm text-amber-900">{fmtAmt(stats.portsCollectesMontant + stats.portsACollecterMontant + ppRecusM + ppARecevoirM)} DH</b> <span className="text-xs text-gray-500">({exp(stats.portsCollectes + stats.portsACollecterCount + ppRecusN + ppARecevoirN)})</span></span>
        </div>
        {line('Ports dus', stats.portsCollectes + stats.portsACollecterCount, stats.portsCollectesMontant + stats.portsACollecterMontant, 'text-blue-700')}
        {line('Ports payés à ramasser', ppRecusN + ppARecevoirN, ppRecusM + ppARecevoirM, 'text-indigo-700')}
        <div className="border-t border-amber-200 pt-1.5 space-y-1">
          {line('Encaissé (collectés + reçus)', stats.portsCollectes + ppRecusN, stats.portsCollectesMontant + ppRecusM, 'text-green-700')}
          {line('Reste (à collecter + à recevoir)', stats.portsACollecterCount + ppARecevoirN, stats.portsACollecterMontant + ppARecevoirM, 'text-amber-700')}
        </div>
      </div>

      {/* 💼 À verser */}
      <div className="bg-linear-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-2 text-sm font-bold text-purple-800"><TrendingUp className="w-5 h-5 text-purple-600" /> À verser</span>
        </div>
        {jour ? (<>
          {/* 📅 Versement par JOUR DE COLLECTE : même montant que la carte « Collectes par jour » de cette journée */}
          <select value={jour.selected} onChange={e => jour.onSelect(e.target.value)}
            className="w-full mb-2 px-2 py-1 rounded-lg border border-purple-200 bg-white text-xs font-semibold text-purple-800">
            {jour.days.map(d => <option key={d.key} value={d.key}>Collectes du {d.label}{d.aVerser > 0 ? ` — ${fmtAmt(d.aVerser)} DH à verser` : ' — versé ✅'}</option>)}
          </select>
          <div className="text-2xl font-bold text-purple-900 tabular-nums">{fmtAmt(jour.montant)} DH</div>
          <div className="text-xs text-purple-700 font-medium mt-1">Collecté ce jour-là, reçu par l'agence, pas encore versé</div>
          {jour.montant > 0 && (
            <div className="mt-2 space-y-0.5 text-[11px] text-purple-800">
              <div className="flex justify-between"><span>dont expéditions du jour</span><b className="tabular-nums">{fmtAmt(jour.duJour)} DH</b></div>
              {jour.anciens.length > 0 && <div className="flex justify-between"><span>dont expéditions antérieures</span><b className="tabular-nums">{fmtAmt(jour.anciens.reduce((s, [, m]) => s + m, 0))} DH</b></div>}
              {jour.anciens.slice(0, 4).map(([k, m]) => <div key={k} className="flex justify-between pl-3 text-purple-600"><span>📦 exp. du {k.split('-').reverse().join('/')}</span><span className="tabular-nums">{fmtAmt(m)} DH</span></div>)}
              {jour.anciens.length > 4 && <div className="pl-3 italic text-purple-500">+ {jour.anciens.length - 4} autre(s) date(s)</div>}
            </div>
          )}
          {(jour.nonRecu || 0) > 0 && (
            <div className="mt-2 text-[11px] text-amber-700 flex justify-between gap-2" title="Ports dus collectés par les livreurs mais pas encore reçus par le chef d'agence (envoi du chef d'exploitation non validé) : ils seront versables une fois reçus.">
              <span>⏳ Pas encore reçus ce jour-là</span><b className="tabular-nums">{fmtAmt(jour.nonRecu || 0)} DH</b>
            </div>
          )}
          <div className="mt-2 pt-1.5 border-t border-purple-200 text-[11px] text-purple-700 flex justify-between">
            <span>Total non versé (toutes journées)</span><b className="tabular-nums">{fmtAmt(jour.totalNonVerse)} DH</b>
          </div>
          {(jour.totalNonRecu || 0) > 0 && (
            <div className="text-[11px] text-amber-700 flex justify-between gap-2">
              <span>⏳ Chez le chef d'exploitation / les livreurs</span><b className="tabular-nums">{fmtAmt(jour.totalNonRecu || 0)} DH</b>
            </div>
          )}
        </>) : aVerserDetail ? (<>
          <div className="text-2xl font-bold text-purple-900 tabular-nums">{fmtAmt(aVerserDetail.total)} DH</div>
          {aVerserDetail.note && <div className="text-xs text-purple-700 font-medium mt-1">{aVerserDetail.note}</div>}
          <div className="mt-2 space-y-1">
            {aVerserDetail.lines.map(l => (
              <div key={l.label} className="flex items-baseline justify-between gap-2 text-xs" title={l.hint}>
                <span className="text-purple-800">{l.label}</span>
                <span className="tabular-nums text-right"><b className="text-purple-900">{fmtAmt(l.m)} DH</b> <span className="text-[11px] text-gray-500">({exp(l.n)})</span></span>
              </div>
            ))}
          </div>
        </>) : (<>
          <div className="text-2xl font-bold text-purple-900 tabular-nums">{fmtAmt(aVerser)} DH</div>
          <div className="text-xs text-purple-700 font-medium mt-1">Ports dus collectés + ports payés à ramasser reçus</div>
        </>)}
      </div>
    </div>
    </div>
  )
}
