const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function fixRetryParcel() {
  const trackingId = 'LMA-44S9V8H9C-FZ27';

  console.log(`🔧 Correction du colis: ${trackingId}\n`);

  try {
    // Chercher le colis
    const snapshot = await db.collection('parcels')
      .where('trackingId', '==', trackingId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log('❌ Colis non trouvé');
      process.exit(1);
    }

    const doc = snapshot.docs[0];
    const parcel = doc.data();

    console.log('📦 Colis trouvé:');
    console.log(`   Status actuel: ${parcel.status}`);
    console.log(`   wasReturned: ${parcel.wasReturned}`);
    console.log(`   returnedAt: ${parcel.returnedAt ? 'Oui' : 'Non'}`);
    console.log(`   returnToCity: ${parcel.returnToCity || 'N/A'}`);

    // Supprimer TOUS les champs de retour
    await doc.ref.update({
      status: 'En livraison',
      wasReturned: FieldValue.delete(),
      returnedAt: FieldValue.delete(),
      returnReason: FieldValue.delete(),
      returnToCity: FieldValue.delete(),
      loadedOnTruckAt: FieldValue.delete(),
      loadedOnTruckBy: FieldValue.delete(),
      returnLoadedAt: FieldValue.delete(),
      returnLoadedBy: FieldValue.delete(),
      retryDeliveryAt: new Date(),
      retryDeliveryBy: 'Admin (correction manuelle)'
    });

    console.log('\n✅ Colis corrigé avec succès !');
    console.log('   - Status: En livraison');
    console.log('   - Tous les champs de retour supprimés');
    console.log('   - Badge RETOURNÉ devrait disparaître');
    console.log('   - Trajet devrait être: Casablanca → Agadir\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

fixRetryParcel();
