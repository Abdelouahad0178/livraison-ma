const admin = require('firebase-admin');

// Initialiser avec les credentials par défaut (Application Default Credentials)
admin.initializeApp({
  projectId: 'arelanc'
});

const auth = admin.auth();

async function resetPassword() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('❌ Usage: node resetPassword.cjs <email> <nouveau-mot-de-passe>');
    process.exit(1);
  }

  try {
    console.log(`🔐 Recherche de l'utilisateur: ${email}...`);

    // Récupérer l'utilisateur par email
    const user = await auth.getUserByEmail(email);

    console.log(`✅ Utilisateur trouvé: ${user.uid}`);
    console.log(`📧 Email: ${user.email}`);

    // Mettre à jour le mot de passe
    await auth.updateUser(user.uid, {
      password: newPassword
    });

    console.log(`✅ Mot de passe mis à jour avec succès!`);
    console.log(`\n🔑 Nouveaux identifiants:`);
    console.log(`   Email: ${email}`);
    console.log(`   Mot de passe: ${newPassword}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);

    if (error.code === 'auth/user-not-found') {
      console.error('\n💡 Cet email n\'existe pas dans Firebase Auth');
    } else if (error.code === 'auth/invalid-password') {
      console.error('\n💡 Le mot de passe doit contenir au moins 6 caractères');
    }

    process.exit(1);
  }
}

resetPassword();
