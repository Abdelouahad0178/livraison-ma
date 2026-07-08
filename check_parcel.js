const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, limit } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBpCwZM3MYe8t_w4L7C7IwXg51vgjINJoM",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "1027827992158",
  appId: "1:1027827992158:web:d3b0c3dc93b0f1e68d4e9e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkParcel() {
  console.log('🔍 Recherche du colis 1135274...\n');
  
  // 1. Chercher par senderNic
  const q1 = query(collection(db, 'parcels'), where('senderNic', '==', '1135274'), limit(5));
  const snap1 = await getDocs(q1);
  console.log(`1️⃣ Recherche senderNic = "1135274" → ${snap1.size} résultat(s)`);
  if (!snap1.empty) {
    snap1.forEach(d => console.log('   ✓', d.id, d.data().senderNic, d.data().sender?.nic));
  }

  // 2. Chercher par sender.nic
  const q2 = query(collection(db, 'parcels'), where('sender.nic', '==', '1135274'), limit(5));
  const snap2 = await getDocs(q2);
  console.log(`2️⃣ Recherche sender.nic = "1135274" → ${snap2.size} résultat(s)`);
  if (!snap2.empty) {
    snap2.forEach(d => console.log('   ✓', d.id, d.data().senderNic, d.data().sender?.nic));
  }

  // 3. Chercher par trackingId
  const q3 = query(collection(db, 'parcels'), where('trackingId', '==', '1135274'), limit(5));
  const snap3 = await getDocs(q3);
  console.log(`3️⃣ Recherche trackingId = "1135274" → ${snap3.size} résultat(s)`);
  if (!snap3.empty) {
    snap3.forEach(d => console.log('   ✓', d.id, d.data().trackingId));
  }

  // 4. Chercher avec LIKE (commence par 1135)
  const q4 = query(
    collection(db, 'parcels'), 
    where('senderNic', '>=', '1135'), 
    where('senderNic', '<', '1136'),
    limit(20)
  );
  const snap4 = await getDocs(q4);
  console.log(`\n4️⃣ Recherche senderNic commence par "1135" → ${snap4.size} résultat(s)`);
  if (!snap4.empty) {
    snap4.forEach(d => console.log('   ', d.data().senderNic, '→', d.id));
  }

  process.exit(0);
}

checkParcel().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
