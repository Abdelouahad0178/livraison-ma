const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function countParcels() {
  try {
    console.log('🔍 Comptage des colis...\n');

    // Compter les colis actifs
    const parcelsSnapshot = await db.collection('parcels').count().get();
    const activeParcels = parcelsSnapshot.data().count;

    // Compter les colis archivés
    const archiveSnapshot = await db.collection('parcels_archive').count().get();
    const archivedParcels = archiveSnapshot.data().count;

    const total = activeParcels + archivedParcels;

    console.log('📊 RÉSULTATS:\n');
    console.log(`   Colis ACTIFS:    ${activeParcels.toLocaleString()} colis`);
    console.log(`   Colis ARCHIVÉS:  ${archivedParcels.toLocaleString()} colis`);
    console.log(`   ─────────────────────────────────`);
    console.log(`   TOTAL:           ${total.toLocaleString()} colis\n`);

    // Compter par statut (pour les actifs uniquement)
    console.log('📈 Détail des colis ACTIFS par statut:\n');

    const statusCounts = {};
    const parcelsQuery = await db.collection('parcels').get();

    parcelsQuery.docs.forEach(doc => {
      const status = doc.data().status || 'Inconnu';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        console.log(`   ${status.padEnd(25)} ${count.toLocaleString()} colis`);
      });

    console.log('\n✅ Comptage terminé!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

countParcels();
