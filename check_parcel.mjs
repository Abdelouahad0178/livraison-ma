import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';

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

console.log('🔍 Recherche du colis 1135274...\n');

// 1. Chercher par senderNic
const q1 = query(collection(db, 'parcels'), where('senderNic', '==', '1135274'), limit(5));
const snap1 = await getDocs(q1);
console.log(`1️⃣ senderNic = "1135274" → ${snap1.size} résultat(s)`);
if (!snap1.empty) {
  snap1.forEach(d => console.log('   ✓', d.id, '→ senderNic:', d.data().senderNic));
}

// 2. Chercher qui commence par 1135
const q2 = query(
  collection(db, 'parcels'), 
  where('senderNic', '>=', '1135'), 
  where('senderNic', '<', '1136'),
  limit(20)
);
const snap2 = await getDocs(q2);
console.log(`\n2️⃣ senderNic commence par "1135" → ${snap2.size} résultat(s)`);
if (!snap2.empty) {
  snap2.forEach(d => console.log('   ', d.data().senderNic));
}

process.exit(0);
