import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync('./serviceAccountKey.json', 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixBulkPortEntries() {
  console.log('🔍 Recherche des entrées de caisse problématiques...');

  // Trouver toutes les entrées récentes de port_du pour elkerdaoui@gmail.com
  const userQuery = await db.collection('users')
    .where('email', '==', 'elkerdaoui@gmail.com')
    .limit(1)
    .get();

  if (userQuery.empty) {
    console.log('❌ Utilisateur non trouvé');
    return;
  }

  const userId = userQuery.docs[0].id;
  const userName = userQuery.docs[0].data().name;
  console.log(`✅ Utilisateur trouvé: ${userName} (${userId})`);

  // Récupérer les dernières entrées de caisse
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const entriesSnapshot = await db.collection('caisseEntries')
    .where('cashierId', '==', userId)
    .where('category', '==', 'port_du')
    .where('createdAt', '>', twoHoursAgo)
    .orderBy('createdAt', 'desc')
    .get();

  console.log(`📊 ${entriesSnapshot.size} entrées trouvées dans les 2 dernières heures`);

  const entriesToDelete = [];
  const entreeCount = { entree: 0, sortie: 0 };
  let totalAmount = 0;

  entriesSnapshot.forEach(doc => {
    const data = doc.data();
    const type = data.type || 'unknown';
    entreeCount[type] = (entreeCount[type] || 0) + 1;

    if (data.type === 'sortie') {
      entriesToDelete.push({ id: doc.id, amount: data.amount || 0 });
      totalAmount += (data.amount || 0);
    }
  });

  console.log(`\n📈 Statistiques:`);
  console.log(`   - Entrées (OK): ${entreeCount.entree || 0}`);
  console.log(`   - Sorties (ERREUR): ${entreeCount.sortie || 0}`);
  console.log(`   - Montant total des sorties erronées: ${totalAmount.toFixed(2)} DH`);
  console.log(`\n🗑️  ${entriesToDelete.length} sorties erronées à supprimer\n`);

  if (entriesToDelete.length === 0) {
    console.log('✅ Aucune entrée erronée trouvée');
    return;
  }

  console.log('⚠️  ATTENTION: Cette opération va supprimer les entrées de type "sortie"');
  console.log('   Attendez 5 secondes... (Ctrl+C pour annuler)\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  // Supprimer par batch de 500
  let deleted = 0;
  for (let i = 0; i < entriesToDelete.length; i += 500) {
    const batch = db.batch();
    const chunk = entriesToDelete.slice(i, i + 500);

    chunk.forEach(entry => {
      batch.delete(db.collection('caisseEntries').doc(entry.id));
    });

    await batch.commit();
    deleted += chunk.length;
    console.log(`✅ ${deleted}/${entriesToDelete.length} entrées supprimées...`);
  }

  console.log(`\n✅ TERMINÉ: ${deleted} entrées erronées supprimées`);
  console.log(`💰 Solde corrigé: +${totalAmount.toFixed(2)} DH\n`);
}

fixBulkPortEntries()
  .then(() => {
    console.log('✅ Script terminé avec succès');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  });
