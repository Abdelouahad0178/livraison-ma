import CentralCollectorPage from './CentralCollectorPage'

/**
 * 🧾 Analyseur Chèque = page de l'encaisseur central en mode « chèques » : mêmes onglets et mêmes fonctions
 * (contrôle / pointage partagé, documents, réception, fournisseurs, archives), limités aux COD chèque / traite
 * (part document d'un COD mixte), sans les actions de suppression massive.
 * Avant : ancienne copie de la page de l'encaisseur central, dont le filtre « chèques » n'avait jamais été activé.
 */
export default function AnalyseurChequePage() {
  return <CentralCollectorPage mode="cheque" />
}
