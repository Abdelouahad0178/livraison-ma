# 🗑️ Guide : Supprimer toutes les données (sauf utilisateurs)

## 📋 Checklist complète

### ✅ Étape 1 : Obtenir le fichier serviceAccount.json

**STATUS : À FAIRE** ⏳

Suivez le guide : **`OBTENIR_SERVICE_ACCOUNT.md`**

**Résumé ultra-rapide :**
1. Ouvrir https://console.firebase.google.com/
2. Projet "arelanc" → ⚙️ Paramètres → Comptes de service
3. "Générer une nouvelle clé privée"
4. Télécharger le fichier
5. Le renommer en `serviceAccount.json`
6. Le placer ici : `C:\Users\chaab\Desktop\livraison-ma\serviceAccount.json`

### ✅ Étape 2 : Vérifier que le fichier est bien placé

```bash
ls -la serviceAccount.json
```

Vous devriez voir quelque chose comme :
```
-rw-r--r-- 1 chaab 197609 2345 May 29 16:00 serviceAccount.json
```

### ✅ Étape 3 : Lancer le script

```bash
node deleteAllDataExceptUsers.mjs
```

Le script vous demandera de confirmer en tapant : **"OUI SUPPRIMER"**

### ✅ Étape 4 : Patienter pendant la suppression

Le script affichera la progression :
```
🗑️  SUPPRESSION DE TOUTES LES DONNÉES (SAUF UTILISATEURS)
======================================================================

📦 Traitement de "parcels"...
   ✓ 500 documents supprimés de parcels...
   ✓ 1000 documents supprimés de parcels...
✅ Collection "parcels" supprimée : 1234 documents au total

📦 Traitement de "clients"...
...
```

### ✅ Étape 5 : Vérifier le résultat

À la fin, vous verrez un résumé :
```
======================================================================
✅ SUPPRESSION TERMINÉE
======================================================================
📊 Collections supprimées : 31/31
📄 Documents supprimés : 12 345
⏱️  Durée : 45.23s
🔒 Collection "users" préservée ✓
======================================================================
```

---

## ⚠️ IMPORTANT À SAVOIR

### Ce qui SERA supprimé ❌

- ❌ Tous les colis (parcels)
- ❌ Tous les clients
- ❌ Toutes les opérations de caisse
- ❌ Tous les versements et transferts
- ❌ Tous les rapports
- ❌ Tous les véhicules
- ❌ Toutes les arrivages
- ❌ Tous les secteurs
- ❌ Toutes les signatures
- ❌ Tous les tarifs
- ❌ ... et bien plus

### Ce qui sera PRÉSERVÉ ✅

- ✅ **Tous les comptes utilisateurs** (admin, agents, chauffeurs, caissiers, etc.)
- ✅ Les règles Firestore
- ✅ La structure de la base de données
- ✅ La configuration Firebase
- ✅ L'authentification Firebase

### Après la suppression

- Les utilisateurs peuvent toujours se connecter avec leurs comptes
- Vous pouvez créer de nouveaux colis/clients depuis zéro
- C'est comme un "reset" complet du site (sauf les comptes)

---

## 🛡️ Sécurité du fichier serviceAccount.json

### ✅ Déjà fait automatiquement

- ✅ Ajouté à `.gitignore` (ne sera jamais commité dans Git)

### ⚠️ À NE JAMAIS FAIRE

- ❌ Le commiter dans Git
- ❌ Le partager sur Slack/WhatsApp/Email
- ❌ Le mettre sur Google Drive/Dropbox public
- ❌ Le laisser sur un serveur public

### 💡 Que faire après utilisation ?

**Option 1 : Le supprimer** (recommandé si usage ponctuel)
```bash
rm serviceAccount.json
```

**Option 2 : Le garder en local** (si vous comptez l'utiliser souvent)
- Laissez-le dans le dossier
- Il est déjà dans `.gitignore`, donc sûr

---

## 🆘 Problèmes fréquents

### "Cannot find module './serviceAccount.json'"
➡️ Le fichier n'est pas au bon endroit. Vérifiez le chemin.

### "Permission denied"
➡️ Le Service Account n'a pas les bonnes permissions. Régénérez-le depuis Firebase.

### "timeout" ou script très long
➡️ Normal si vous avez beaucoup de données (des dizaines de milliers de documents).

---

## 📞 Besoin d'aide ?

Lisez les guides :
- `OBTENIR_SERVICE_ACCOUNT.md` - Comment obtenir le fichier
- `SCRIPTS_README.md` - Documentation complète des scripts

---

**Prêt ?** Une fois le fichier `serviceAccount.json` en place, lancez simplement :
```bash
node deleteAllDataExceptUsers.mjs
```
