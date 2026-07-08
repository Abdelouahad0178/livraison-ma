# 🔍 Configuration Sentry - Monitoring Erreurs Production

## 📋 Qu'est-ce que Sentry?

**Sentry** = Système qui vous **alerte** quand une erreur se produit sur le site.

### Avantages:
- 🚨 **Notification immédiate** des bugs
- 📊 **Statistiques** des erreurs
- 🎯 **Stack trace complète** pour debug rapide
- 👥 **Qui est affecté** (quel utilisateur)
- 🆓 **Gratuit** jusqu'à 5000 erreurs/mois

---

## 🚀 ÉTAPES D'INSTALLATION (10 minutes)

### 1️⃣ Créer un Compte Sentry (GRATUIT)

1. **Allez sur**: https://sentry.io/signup/
2. **Cliquez**: "Start free trial" (pas besoin de carte bancaire!)
3. **Remplissez**:
   ```
   Email: [votre email]
   Mot de passe: [créez un mdp fort]
   ```
4. **Validez** votre email

---

### 2️⃣ Créer un Projet

1. **Page d'accueil Sentry** → "Create Project"
2. **Sélectionnez**:
   - Platform: **React**
   - Language: **TypeScript** (ou JavaScript)
3. **Nommez le projet**:
   ```
   Project name: bg-express-production
   Team: My Team (par défaut)
   ```
4. **Cliquez**: "Create Project"

---

### 3️⃣ Récupérer votre DSN

Après création du projet, Sentry affiche une page avec:

```javascript
Sentry.init({
  dsn: "https://xxxxxxxxxxxxx@o123456.ingest.sentry.io/789012",
  // ...
});
```

**COPIEZ ce DSN!** ⚠️ C'est comme un mot de passe.

Format: `https://[code]@[region].ingest.sentry.io/[project-id]`

---

### 4️⃣ Ajouter le DSN à votre Projet

#### Créer fichier `.env.production`

Dans le dossier `livraison-ma/`, créez ce fichier:

```bash
# .env.production
VITE_SENTRY_DSN=https://xxxxxxxxxxxxx@o123456.ingest.sentry.io/789012
VITE_APP_VERSION=2.0.0
```

⚠️ **Remplacez** `https://xxxxx...` par VOTRE DSN Sentry!

#### Vérifier que `.env.production` est ignoré par Git

```bash
# Vérifiez que .gitignore contient:
.env*
!.env.example
```

✅ **IMPORTANT**: Ne commitez JAMAIS le DSN dans Git!

---

### 5️⃣ Build Production avec Sentry

```bash
# Build pour production
npm run build

# Le DSN sera automatiquement utilisé!
```

Le code de monitoring est **déjà configuré** dans votre projet ✅  
(fichier `src/utils/monitoring.ts`)

---

### 6️⃣ Déployer

```bash
firebase deploy --only hosting
```

---

### 7️⃣ Tester que ça Fonctionne

#### Option A: Test manuel d'erreur

1. Ouvrez votre site: https://arelanc.web.app
2. Ouvrez console navigateur (F12)
3. Tapez:
   ```javascript
   throw new Error("Test Sentry - erreur volontaire")
   ```
4. Allez sur Sentry → Onglet "Issues"
5. Vous devriez voir l'erreur apparaître! 🎉

#### Option B: Test réel

Utilisez normalement le site. Si une vraie erreur se produit → Sentry vous alerte!

---

## 📧 Configuration Notifications

### Recevoir Emails pour chaque erreur

1. **Sentry** → Votre projet → **Settings** (⚙️)
2. **Alerts** → "Create New Alert"
3. **Choisissez**:
   ```
   Alert Type: Issues
   Trigger: When an event is first seen
   Action: Send email to: [votre email]
   ```
4. **Nommez**: "Nouvelles erreurs production"
5. **Sauvegardez**

✅ Maintenant vous recevez un email à chaque nouvelle erreur!

### Notifications Slack (Optionnel)

Si vous utilisez Slack:

1. **Settings** → **Integrations** → **Slack**
2. Suivez les étapes
3. Choisissez le channel (#tech, #bugs, etc.)

---

## 📊 Dashboard Sentry - Ce que Vous Verrez

### Page "Issues" (Erreurs)

Pour chaque erreur vous voyez:

```
❌ TypeError: Cannot read property 'length' of undefined

📍 Où: src/components/ClientAutocomplete.tsx:85
📅 Quand: Il y a 2 minutes
👤 Qui: user@example.com (3 utilisateurs affectés)
🔢 Fréquence: 12 occurrences
📱 Navigateur: Chrome 114, Firefox 102
```

### Informations Détaillées

En cliquant sur une erreur:

1. **Stack Trace** complet
2. **Breadcrumbs** (actions utilisateur avant l'erreur)
3. **Variables** et état au moment du crash
4. **Replay Session** (vidéo de ce que l'utilisateur faisait!)

---

## 🎯 Comment Utiliser Sentry au Quotidien

### Routine Recommandée

**Chaque matin**:
1. Ouvrir Sentry Dashboard
2. Regarder "Issues" nouvelles
3. Fixer les erreurs critiques

**Après chaque déploiement**:
1. Surveiller Sentry 30 min
2. Vérifier qu'aucune nouvelle erreur

**En cas d'alerte email**:
1. Lire l'erreur
2. Évaluer criticité:
   - 🔴 **Critique**: Empêche utilisation → Fix immédiat
   - 🟡 **Important**: Gênant → Fix dans 24h
   - 🟢 **Mineur**: Cosmétique → Fix quand temps libre

---

## 🔧 Configuration Avancée (Optionnel)

### Filtrer les Erreurs de Développement

Sentry est déjà configuré pour **ignorer** les erreurs en mode DEV.

Vérifiez dans `src/utils/monitoring.ts`:
```typescript
if (!dsn) return // skip in dev without DSN
```

✅ Parfait!

### Ajuster le Taux d'Échantillonnage

Par défaut: 20% des sessions sont tracées.

Pour modifier (dans `monitoring.ts`):
```typescript
tracesSampleRate: 0.2, // 20% → Changez à 0.5 pour 50%
```

**Attention**: Plus de traces = plus de quota utilisé!

### Source Maps (Pour Debug Précis)

Pour voir le code original (pas minifié):

```bash
# 1. Installer plugin Vite Sentry
npm install --save-dev @sentry/vite-plugin

# 2. Ajouter dans vite.config.ts
import sentryVitePlugin from '@sentry/vite-plugin'

export default defineConfig({
  plugins: [
    // ... vos plugins existants
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: 'votre-org',
      project: 'bg-express-production',
    }),
  ],
})
```

---

## ⚠️ IMPORTANT - Sécurité

### ❌ NE PAS faire:
- Commiter `.env.production` dans Git
- Partager votre DSN publiquement
- Laisser le DSN dans le code source

### ✅ À faire:
- DSN uniquement dans `.env.production`
- `.env*` dans `.gitignore`
- Régénérer DSN si compromis (Settings → Client Keys)

---

## 🆘 Dépannage

### Problème: "Aucune erreur dans Sentry"

**Solutions**:
1. Vérifiez que `VITE_SENTRY_DSN` est bien défini:
   ```bash
   cat .env.production
   ```
2. Rebuild + redeploy:
   ```bash
   npm run build
   firebase deploy
   ```
3. Vérifiez dans console navigateur:
   ```javascript
   // Devrait afficher l'objet Sentry
   console.log(window.Sentry)
   ```

### Problème: "Trop d'erreurs, quota dépassé"

**Solutions**:
1. Passer au plan payant (10$/mois pour 50K erreurs)
2. Filtrer les erreurs non critiques
3. Corriger les bugs fréquents! 😄

---

## 📱 Application Mobile Sentry

Pour surveiller depuis votre téléphone:

1. **Téléchargez** l'app "Sentry" (iOS/Android)
2. **Connectez-vous** avec vos identifiants
3. ✅ Recevez notifications push instantanées!

---

## ✅ Checklist Finale

Après installation, vérifiez:

- [ ] Compte Sentry créé
- [ ] Projet "bg-express-production" créé
- [ ] DSN copié
- [ ] `.env.production` créé avec DSN
- [ ] Build production OK
- [ ] Déployé sur Firebase
- [ ] Test erreur → Erreur visible dans Sentry
- [ ] Notifications email configurées
- [ ] App mobile installée (optionnel)

---

## 🎓 Ressources

- **Documentation**: https://docs.sentry.io/platforms/javascript/guides/react/
- **Dashboard**: https://sentry.io/organizations/[votre-org]/issues/
- **Support**: support@sentry.io

---

**Sentry est maintenant configuré!** 🎉  
Vous serez alerté de toute erreur en production.

**Dormez tranquille!** 😴
