# 🔑 Comment obtenir le fichier serviceAccount.json

Pour exécuter les scripts d'administration (suppression de données, etc.), vous avez besoin d'un fichier **Service Account Key** de Firebase.

## 📋 Étapes pour obtenir le fichier

### 1. Aller sur Firebase Console
👉 https://console.firebase.google.com/

### 2. Sélectionner votre projet
- Cliquez sur votre projet **"arelanc"** (ou le nom de votre projet)

### 3. Accéder aux paramètres du projet
1. Cliquez sur l'icône **⚙️ (engrenage)** en haut à gauche
2. Sélectionnez **"Paramètres du projet"** (Project settings)

### 4. Aller dans l'onglet "Comptes de service"
1. Cliquez sur l'onglet **"Comptes de service"** (Service accounts)
2. Vous verrez une section **"Firebase Admin SDK"**

### 5. Générer la clé privée
1. Faites défiler vers le bas
2. Cliquez sur le bouton **"Générer une nouvelle clé privée"** (Generate new private key)
3. Une popup de confirmation apparaîtra
4. Cliquez sur **"Générer la clé"**

### 6. Télécharger et renommer le fichier
1. Un fichier JSON sera téléchargé automatiquement
2. Il s'appellera quelque chose comme : `arelanc-1234567890ab.json`
3. **RENOMMEZ-LE** en : `serviceAccount.json`
4. **DEPLACEZ-LE** à la racine de votre projet :
   ```
   C:\Users\chaab\Desktop\livraison-ma\serviceAccount.json
   ```

## ⚠️ SECURITE IMPORTANTE

### ❌ NE JAMAIS faire :
- ❌ Commiter ce fichier dans Git
- ❌ Partager ce fichier publiquement
- ❌ L'envoyer par email/Slack/WhatsApp
- ❌ Le mettre sur un cloud public

### ✅ TOUJOURS faire :
- ✅ Le garder en local uniquement
- ✅ Vérifier que `.gitignore` contient `serviceAccount.json`
- ✅ Le stocker dans un gestionnaire de mots de passe si backup nécessaire
- ✅ Révoquer et régénérer la clé si elle est compromise

## 🔍 Vérifier que tout est bon

Une fois le fichier téléchargé et renommé, vérifiez :

```bash
# Le fichier doit exister
ls -la serviceAccount.json

# Le fichier doit contenir du JSON valide
head -5 serviceAccount.json
```

Vous devriez voir quelque chose comme :
```json
{
  "type": "service_account",
  "project_id": "arelanc",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
```

## ✅ Ensuite vous pouvez lancer le script

```bash
node deleteAllDataExceptUsers.mjs
```

---

## 🆘 En cas de problème

### Erreur "Cannot find module './serviceAccount.json'"
➡️ Le fichier n'est pas au bon endroit. Vérifiez qu'il est bien à la racine du projet.

### Erreur "Unexpected token" ou "SyntaxError"
➡️ Le fichier JSON est corrompu. Re-téléchargez-le depuis Firebase.

### Erreur "Permission denied"
➡️ Le Service Account n'a pas les permissions. Générez une nouvelle clé depuis Firebase Console.

---

## 📚 Plus d'informations

Documentation officielle Firebase :
https://firebase.google.com/docs/admin/setup#initialize-sdk
