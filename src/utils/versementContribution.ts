// 💼 Copie allégée des versements (30/10/2026) — contribution d'UNE expédition aux « Collectes par jour » de son agence.
// Point d'entrée PARTAGÉ : la Cloud Function syncVersementStats et le script de rattrapage utilisent la version compilée
// (functions/shared/versementContribution.js, `node scripts/build-functions-shared.mjs`) de CE fichier — donc la même
// règle que les pages (collecteContributionFor, utils/agencyCaisseRules) : mêmes chiffres partout.
import { collecteContributionFor, type CollecteContribution } from './agencyCaisseRules'

export interface VersementContribution extends CollecteContribution { city: string }

/**
 * Agence et contribution d'une expédition : port dû → agence de DESTINATION ; port payé ramassé au guichet → agence de
 * DÉPART. `holdersOf(ville)` : comptes chef d'agence / agent pro de la ville (argent « dans la caisse » du chef d'agence).
 * null = l'expédition ne compte dans aucune caisse (pas encaissée, argent d'avant le 05/10, retour…).
 */
export function versementContributionOf(p: any, holdersOf: (city: string) => Set<string>): VersementContribution | null {
  if (!p) return null
  const cities = [...new Set([p.destinationCity, p.originCity].filter(Boolean) as string[])]
  for (const city of cities) {
    const c = collecteContributionFor(p, city, holdersOf(city))
    if (c) return { city, ...c }
  }
  return null
}
