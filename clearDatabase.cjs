const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Collections à supprimer (toutes sauf users)
const collectionsToDelete = [
  'parcels',
  'parcels_archive',
  'clients',
  'deliverySignatures',
  'lostParcels',
  'portalAccounts',
  'vehicles',
  'sectors',
  'tariffs',
  'agencies',
  'cod_requests',
  'cod_reglements',
  'caisse_transactions',
  'caisse_admin_transactions',
  'port_du_transactions',
  'central_collector_transactions',
  'notes',
  'agent_notes',
  'expeditions',
  'backup_parcels',
  'backup_clients',
  'backup_users',
  'activity_logs',
  'director_logs',
  'operation_locks',
  'modification_requests',
  'client_messages',
  'caisse_clotures',
  'caissier_remarks',
  'central_cash',
  'bank_deposits'
];

async function deleteCollection(collectionName) {
  const collectionRef = db.collection(collectionName);
  const batchSize = 500;
  let deletedCount = 0;

  async function deleteQueryBatch() {
    const snapshot = await collectionRef.limit(batchSize).get();

    if (snapshot.size === 0) {
      return 0;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    deletedCount += snapshot.size;

    console.log(`  Supprimé ${deletedCount} documents de ${collectionName}...`);

    if (snapshot.size === batchSize) {
      // Il y a potentiellement plus de documents
      return deleteQueryBatch();
    }

    return deletedCount;
  }

  try {
    await deleteQueryBatch();
    console.log(`✅ Collection ${collectionName}: ${deletedCount} documents supprimés`);
    return deletedCount;
  } catch (error) {
    console.error(`❌ Erreur lors de la suppression de ${collectionName}:`, error.message);
    return 0;
  }
}

async function clearDatabase() {
  console.log('🗑️  Début de la suppression des collections...\n');
  console.log('⚠️  Les utilisateurs (collection "users") seront PRÉSERVÉS\n');

  let totalDeleted = 0;

  for (const collectionName of collectionsToDelete) {
    const count = await deleteCollection(collectionName);
    totalDeleted += count;
  }

  console.log('\n✅ Suppression terminée!');
  console.log(`📊 Total: ${totalDeleted} documents supprimés`);
  console.log('👥 Collection "users" préservée');

  process.exit(0);
}

clearDatabase().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
