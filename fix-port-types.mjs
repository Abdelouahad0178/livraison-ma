#!/usr/bin/env node

/**
 * Script pour corriger les portType des expéditions existantes
 *
 * Logique :
 * - Si serviceType contient "especes", "cheque" ou "traite" → portType = 'port_paye'
 * - Sinon (simple, etc.) → portType = 'port_en_compte'
 * - Port Dû reste inchangé (c'est un cas spécifique où le destinataire paie)
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBHTE_wPqGH_CdyHo3E1xmXOd6uS1f3_kg",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "670086717762",
  appId: "1:670086717762:web:ffbf4dbb86fb1a6c83d8d7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixPortTypes() {
  console.log('🔧 Démarrage de la correction des portType...\n');

  try {
    // Récupérer tous les colis
    const parcelsRef = collection(db, 'parcels');
    const snapshot = await getDocs(parcelsRef);

    console.log(`📦 ${snapshot.size} colis trouvés\n`);

    let updatedCount = 0;
    let portPayeCount = 0;
    let portEnCompteCount = 0;
    let portDuCount = 0;
    let skippedCount = 0;

    for (const docSnapshot of snapshot.docs) {
      const parcel = docSnapshot.data();
      const trackingId = parcel.trackingId || docSnapshot.id;
      const currentPortType = parcel.portType;
      const serviceType = parcel.serviceType || '';

      // Déterminer le nouveau portType basé sur le serviceType
      let newPortType = currentPortType;

      // Si c'est déjà port_du, on ne change pas (cas spécifique)
      if (currentPortType === 'port_du') {
        portDuCount++;
        continue;
      }

      // Vérifier si le serviceType contient un paiement immédiat
      const hasPaymentImmediat = serviceType.includes('especes') ||
                                 serviceType.includes('cheque') ||
                                 serviceType.includes('traite');

      if (hasPaymentImmediat) {
        newPortType = 'port_paye';
      } else {
        // Pas de paiement immédiat → En Compte
        newPortType = 'port_en_compte';
      }

      // Mettre à jour uniquement si le portType a changé
      if (newPortType !== currentPortType) {
        await updateDoc(doc(db, 'parcels', docSnapshot.id), {
          portType: newPortType
        });

        console.log(`✅ ${trackingId}: ${currentPortType} → ${newPortType} (serviceType: ${serviceType})`);
        updatedCount++;

        if (newPortType === 'port_paye') portPayeCount++;
        if (newPortType === 'port_en_compte') portEnCompteCount++;
      } else {
        skippedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSUMÉ DE LA CORRECTION');
    console.log('='.repeat(60));
    console.log(`Total de colis traités    : ${snapshot.size}`);
    console.log(`Colis mis à jour          : ${updatedCount}`);
    console.log(`  → Port Payé             : ${portPayeCount}`);
    console.log(`  → Port En Compte        : ${portEnCompteCount}`);
    console.log(`Port Dû (non modifié)     : ${portDuCount}`);
    console.log(`Déjà corrects (ignorés)   : ${skippedCount}`);
    console.log('='.repeat(60));
    console.log('\n✨ Correction terminée avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error);
    process.exit(1);
  }
}

// Exécuter le script
fixPortTypes()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
  });
