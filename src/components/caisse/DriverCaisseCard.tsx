import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp, Printer, User } from 'lucide-react'
import { fmtFixed as fmtAmt } from '../../utils/formatNumber'
import { caisseDriverHeaderCount, type CaisseDriverGroup } from '../../utils/agencyCaisseRules'

interface Props {
  /** Groupe livreur de computeCaisseView (Caisse Agence) — y compris « En gare - <ville> ». */
  driver: CaisseDriverGroup
  /** Filtre de statut de Caisse Agence ('all' = tous). */
  statusFilter: string
  statusFilterLabel: string
  open: boolean
  onToggle: () => void
  /** Impression « Imprimer » (feuille de charge) — appelée seulement si le livreur a des expéditions. */
  onPrint: () => void
  /** Contenu déplié (tableau, actions propres à la page). */
  children?: ReactNode
  /** Classes du cadre extérieur (optionnel) — par défaut : le cadre de Caisse Agence. */
  className?: string
}

/**
 * 🧾 Carte livreur de Caisse Agence (onglet Livreurs) — composant UNIQUE utilisé par Caisse Agence
 * et par le Chef d'exploitation (Assignation du matin, Collecte du soir) : même mise en page, mêmes
 * chiffres (nb expéditions dont en compte, À collecter, Collectés, Ramassés, En retard, montants),
 * même bouton Imprimer. Les deux pages ne peuvent donc plus diverger visuellement.
 */
export default function DriverCaisseCard({ driver, statusFilter, statusFilterLabel, open, onToggle, onPrint, children, className }: Readonly<Props>) {
  const h = caisseDriverHeaderCount(driver, statusFilter)
  return (
    <div className={className ?? 'bg-white border border-gray-200 rounded-xl overflow-hidden'}>
      {/* En-tête livreur */}
      <div
        onClick={onToggle}
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{driver.name}</h3>
            <p className="text-xs text-gray-500">
              {/* Même total que l'onglet Journée (règle partagée caisseDriverHeaderCount) : TOUS les colis
                  du livreur sur la période, dont les ports en compte. */}
              {statusFilter !== 'all'
                ? `${h.total} expédition${h.total > 1 ? 's' : ''} (${statusFilterLabel.toLowerCase()})`
                : `${h.total} expéditions${h.enCompte > 0 ? ` (dont ${h.enCompte} en compte)` : ''}`}
              {statusFilter === 'all' && driver.portsPayesParcels.length > 0 && ` -${driver.portsPayesParcels.length} ramassés-`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Statistiques */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className="text-center">
              <div className="text-blue-600 font-bold">{driver.portsACollecterCount}</div>
              <div className="text-xs text-gray-500">À collecter</div>
            </div>
            <div className="text-center">
              <div className="text-green-600 font-bold">{driver.portsCollectesCount}</div>
              <div className="text-xs text-gray-500">Collectés</div>
            </div>
            {driver.portsPayesARecevoirCount > 0 && (
              <div className="text-center">
                <div className="text-indigo-600 font-bold">{driver.portsPayesARecevoirCount}</div>
                <div className="text-xs text-gray-500">Ramassés</div>
              </div>
            )}
            {driver.enRetardCount > 0 && (
              <div className="text-center">
                <div className="text-amber-600 font-bold">{driver.enRetardCount}</div>
                <div className="text-xs text-gray-500">En retard</div>
              </div>
            )}
          </div>

          {/* Montants */}
          <div className="text-right">
            <div className="font-bold text-gray-900">
              {fmtAmt(driver.portsACollecterMontant)} DH
            </div>
            <div className="text-xs text-green-600">
              +{fmtAmt(driver.portsCollectesMontant)} DH
            </div>
            {driver.portsPayesARecevoirMontant > 0 && (
              <div className="text-xs text-indigo-600">
                +{fmtAmt(driver.portsPayesARecevoirMontant)} DH
              </div>
            )}
          </div>

          {/* Impression : feuille de charge du livreur (colonnes sélectionnées, portrait) */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!driver.parcels || driver.parcels.length === 0) {
                alert('⚠️ Aucune expédition pour ce livreur')
                return
              }
              onPrint()
            }}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            title="Imprimer les expéditions de ce livreur (colonnes sélectionnées, portrait)"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimer
          </button>

          {/* Icône expansion */}
          {open ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {open && children}
    </div>
  )
}
