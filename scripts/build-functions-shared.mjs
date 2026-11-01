// Compile les règles PARTAGÉES pages ⇄ serveur (TypeScript de src/) en CommonJS pour les Cloud Functions.
//   node scripts/build-functions-shared.mjs
// → functions/shared/versementContribution.js (fichier GÉNÉRÉ, ne pas modifier à la main : relancer ce script
//   après toute modification de src/utils/agencyCaisseRules.ts, moneyFlow.ts, config/operationalDay.ts…).
import { build } from 'esbuild'

// Règles partagées : versements chef d'agence → admin, argent détenu par le chef d'exploitation (envoi au chef d'agence)
for (const name of ['versementContribution', 'exploitationEnvoi']) {
  await build({
    entryPoints: [`src/utils/${name}.ts`],
    outfile: `functions/shared/${name}.js`,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    logLevel: 'info',
    banner: { js: `// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/${name}.ts — ne pas modifier.` },
  })
}
