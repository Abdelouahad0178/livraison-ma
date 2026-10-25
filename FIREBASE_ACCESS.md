# Acces Firebase local

Le projet utilise **Cloud Firestore**, Firebase Authentication, Storage, Hosting et Cloud Functions. Le projet configure dans `.firebaserc` et `.env` est **arelanc**.

Depuis le dossier du projet, lancer :

```powershell
npm run firebase:check
```

Cette commande verifie la presence de la configuration de l'application, la concordance du projet et l'acces distant a Firestore via le compte de service local. Elle lit au maximum un document de `users`, sans recuperer ses champs ni afficher son identifiant. Elle ne modifie aucune donnee et ne deploie rien.

Le diagnostic utilise `serviceAccountKey.json`, deja present localement. Ce fichier et `.env` sont ignores par Git. Conserver la cle uniquement sur le PC ; ne pas la copier dans le code de l'application ou dans le chat.

L'acces Admin du compte de service ne valide pas les regles Firestore appliquees aux utilisateurs de l'application. Les droits d'ecriture, Authentication, Storage et les deploiements ne sont pas testes par cette commande.

Console du projet : https://console.firebase.google.com/project/arelanc/firestore
