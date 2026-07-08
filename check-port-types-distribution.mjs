#!/usr/bin/env node

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

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

console.log('🔍 Analyse de la distribution des portType...\n');

const parcelsRef = collection(db, 'parcels');
// Prendre un échantillon des 1000 derniers colis
const q = query(parcelsRef, limit(1000));
const snapshot = await getDocs(q);

console.log(`📦 Échantillon : ${snapshot.size} colis\n`);

const distribution = {
  port_paye: 0,
  port_du: 0,
  port_en_compte: 0,
  undefined: 0,
  null: 0,
  other: 0
};

const serviceTypeByPortType = {
  port_paye: {},
  port_du: {},
  port_en_compte: {},
  undefined: {},
  null: {}
};

snapshot.forEach(doc => {
  const data = doc.data();
  const portType = data.portType;
  const serviceType = data.serviceType || 'simple';

  if (portType === 'port_paye') {
    distribution.port_paye++;
    serviceTypeByPortType.port_paye[serviceType] = (serviceTypeByPortType.port_paye[serviceType] || 0) + 1;
  } else if (portType === 'port_du') {
    distribution.port_du++;
    serviceTypeByPortType.port_du[serviceType] = (serviceTypeByPortType.port_du[serviceType] || 0) + 1;
  } else if (portType === 'port_en_compte') {
    distribution.port_en_compte++;
    serviceTypeByPortType.port_en_compte[serviceType] = (serviceTypeByPortType.port_en_compte[serviceType] || 0) + 1;
  } else if (portType === undefined) {
    distribution.undefined++;
    serviceTypeByPortType.undefined[serviceType] = (serviceTypeByPortType.undefined[serviceType] || 0) + 1;
  } else if (portType === null) {
    distribution.null++;
    serviceTypeByPortType.null[serviceType] = (serviceTypeByPortType.null[serviceType] || 0) + 1;
  } else {
    distribution.other++;
  }
});

console.log('📊 DISTRIBUTION DES portType :');
console.log('='.repeat(60));
console.log(`✅ Port payé        : ${distribution.port_paye} (${(distribution.port_paye/snapshot.size*100).toFixed(1)}%)`);
console.log(`📮 Port dû          : ${distribution.port_du} (${(distribution.port_du/snapshot.size*100).toFixed(1)}%)`);
console.log(`💼 Port en compte   : ${distribution.port_en_compte} (${(distribution.port_en_compte/snapshot.size*100).toFixed(1)}%)`);
console.log(`❌ Undefined        : ${distribution.undefined} (${(distribution.undefined/snapshot.size*100).toFixed(1)}%)`);
console.log(`❌ Null             : ${distribution.null} (${(distribution.null/snapshot.size*100).toFixed(1)}%)`);
console.log(`❓ Autre            : ${distribution.other} (${(distribution.other/snapshot.size*100).toFixed(1)}%)`);
console.log('='.repeat(60));

console.log('\n📋 RÉPARTITION serviceType PAR portType :');
console.log('='.repeat(60));

for (const [portType, services] of Object.entries(serviceTypeByPortType)) {
  const total = Object.values(services).reduce((a, b) => a + b, 0);
  if (total > 0) {
    console.log(`\n${portType} (${total} colis) :`);
    for (const [service, count] of Object.entries(services)) {
      console.log(`  • ${service}: ${count}`);
    }
  }
}

process.exit(0);
