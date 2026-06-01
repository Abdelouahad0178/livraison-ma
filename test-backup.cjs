// Script temporaire pour créer un backup manuellement
const admin = require('firebase-admin');
const serviceAccount = require('./serveur-archivage/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'arelanc.appspot.com'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

const BACKUP_COLLECTIONS = [
  'settings', 'parcels', 'users', 'clients', 'payments',
  'caisseEntries', 'agentRemises', 'caissierRemarks', 'caisseClotures',
  'caissierTransactions', 'caissierRequests', 'agentCashRecoveryRequests',
  'agentCodRequests', 'agencyCashes', 'vehicles', 'directorLogs',
  'cities', 'clientMessages', 'clientPortals', 'reglements',
  'reglementsRapports', 'bankDeposits', 'centralCodDeposits', 'centralSupplierPayments',
];

function serializeForBackup(value) {
  if (value && value.constructor && value.constructor.name === 'Timestamp') {
    return { __type: 'timestamp', value: value.toDate().toISOString() };
  }
  if (value instanceof Date) return { __type: 'date', value: value.toISOString() };
  if (Array.isArray(value)) return value.map(serializeForBackup);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serializeForBackup(v)])
    );
  }
  return value;
}

async function createBackup() {
  console.log('Création du backup...');
  const collections = {};
  const counts = {};

  for (const name of BACKUP_COLLECTIONS) {
    try {
      const snap = await db.collection(name).get();
      collections[name] = snap.docs.map(d => ({ id: d.id, data: serializeForBackup(d.data()) }));
      counts[name] = snap.size;
      console.log(`[${name}]: ${snap.size} docs`);
    } catch (err) {
      console.warn(`[${name}] ignoré:`, err.message);
      collections[name] = [];
      counts[name] = 0;
    }
  }

  const backup = {
    app: 'BG Express',
    schema: 'firestore-backup-v1',
    exportedAt: new Date().toISOString(),
    collections,
    counts,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `auto-backups/backup-bgexpress-${ts}.json`;
  const content = JSON.stringify(backup);

  await bucket.file(filename).save(content, {
    contentType: 'application/json',
    metadata: { exportedAt: backup.exportedAt },
  });

  console.log(`✅ Backup créé: ${filename} (${(content.length / 1024).toFixed(0)} Ko)`);
  process.exit(0);
}

createBackup().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
