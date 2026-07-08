#!/usr/bin/env node

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

console.log('🔍 Vérification des codPaymentType pour les COD...\n');

const parcelsRef = collection(db, 'parcels');
const snapshot = await getDocs(parcelsRef);

console.log(`📦 Total colis : ${snapshot.size}\n`);

let totalCod = 0;
let codWithPaymentType = 0;
let codWithoutPaymentType = 0;
let codByType = {
  especes: 0,
  cheque: 0,
  traite: 0,
  autres: 0
};

snapshot.forEach(doc => {
  const data = doc.data();
  const codAmount = parseFloat(data.codAmount) || 0;

  if (codAmount > 0) {
    totalCod++;

    if (data.codPaymentType) {
      codWithPaymentType++;
      if (codByType[data.codPaymentType] !== undefined) {
        codByType[data.codPaymentType]++;
      } else {
        codByType.autres++;
      }
    } else {
      codWithoutPaymentType++;
    }
  }
});

console.log('📊 RÉSULTATS :');
console.log('='.repeat(60));
console.log(`Total COD (codAmount > 0)           : ${totalCod}`);
console.log(`COD avec codPaymentType défini      : ${codWithPaymentType}`);
console.log(`COD SANS codPaymentType             : ${codWithoutPaymentType}`);
console.log('');
console.log('Répartition par type :');
console.log(`  • Espèces : ${codByType.especes}`);
console.log(`  • Chèque  : ${codByType.cheque}`);
console.log(`  • Traite  : ${codByType.traite}`);
console.log(`  • Autres  : ${codByType.autres}`);
console.log('='.repeat(60));

if (codWithoutPaymentType > 0) {
  console.log('\n⚠️  ATTENTION : Il y a des COD sans codPaymentType !');
  console.log('   → Exécutez le script de correction pour les définir par défaut.');
}

process.exit(0);
