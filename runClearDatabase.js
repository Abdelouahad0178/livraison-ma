import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyA4bRe4N7ZeHalEIfv7SaT95m32o9ruPoM",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "1037931380099",
  appId: "1:1037931380099:web:123c2164cb867ea6ef8ab6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

async function clearDatabase() {
  try {
    // Demander les identifiants admin
    const email = process.argv[2];
    const password = process.argv[3];

    if (!email || !password) {
      console.error('❌ Usage: node runClearDatabase.js <admin-email> <admin-password>');
      process.exit(1);
    }

    console.log('🔐 Connexion en tant qu\'admin...');
    await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ Connecté!');

    console.log('\n⚠️  ATTENTION: Cette opération va supprimer TOUTES les données sauf les utilisateurs!');
    console.log('⚠️  Cette action est IRRÉVERSIBLE!\n');
    console.log('🗑️  Suppression en cours...\n');

    const clearDbFunction = httpsCallable(functions, 'clearDatabase');
    const result = await clearDbFunction();

    console.log('\n✅ Suppression terminée!');
    console.log(`📊 Total: ${result.data.totalDeleted} documents supprimés`);
    console.log('\nDétails par collection:');
    for (const [collection, count] of Object.entries(result.data.results)) {
      if (typeof count === 'number') {
        console.log(`  - ${collection}: ${count} documents`);
      } else {
        console.log(`  - ${collection}: ❌ ${count.error}`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

clearDatabase();
