# 📦 LivraisonMA — Système de gestion de livraison

Application React + Firebase pour la gestion de colis au Maroc.

---

## 🚀 Installation rapide

### 1. Installer les dépendances
```bash
npm install
```

### 2. Configurer Firebase
Éditez le fichier `src/firebase/config.js` et remplacez les valeurs par celles de votre projet Firebase :
```js
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "VOTRE_PROJECT.firebaseapp.com",
  projectId: "VOTRE_PROJECT_ID",
  storageBucket: "VOTRE_PROJECT.appspot.com",
  messagingSenderId: "VOTRE_MESSAGING_ID",
  appId: "VOTRE_APP_ID"
}
```

### 3. Lancer en développement
```bash
npm run dev
```

### 4. Build pour production
```bash
npm run build
```

---

## 🏗️ Structure du projet

```
src/
├── firebase/
│   ├── config.js        # Configuration Firebase
│   └── firestore.js     # Helpers Firestore (CRUD, constantes)
├── pages/
│   ├── LoginPage.jsx    # Connexion avec redirection par rôle
│   ├── AgentPage.jsx    # Création colis + ticket imprimable
│   ├── DriverPage.jsx   # Scan QR + mise à jour statut
│   ├── AdminPage.jsx    # Dashboard admin complet
│   └── TrackingPage.jsx # Suivi public (sans auth)
├── App.jsx              # Router + protection des routes
└── main.jsx
```

---

## 👥 Rôles utilisateurs

| Rôle       | URL       | Description                          |
|------------|-----------|--------------------------------------|
| `admin`    | /admin    | Dashboard global, tous les colis     |
| `agent`    | /agent    | Créer des colis, imprimer tickets    |
| `chauffeur`| /driver   | Scanner QR, mettre à jour statuts    |
| Public     | /track    | Suivi de colis sans connexion        |

---

## 🗄️ Créer un utilisateur (Firebase Console)

1. Aller dans **Authentication > Users > Add user**
2. Créer avec email + mot de passe
3. Copier le UID généré
4. Aller dans **Firestore > Collection `users` > Add document**
5. Document ID = UID de l'utilisateur
6. Champs :
   ```
   uid: "LE_UID"
   name: "Nom de l'employé"
   role: "admin" | "agent" | "chauffeur"
   city: "Casablanca"
   ```

---

## 📱 PWA (Progressive Web App)

L'application est configurée comme PWA. Les chauffeurs peuvent l'installer sur leur téléphone pour une utilisation offline partielle.

---

## 🔒 Règles Firestore

Appliquez les règles du fichier `firestore.rules` dans la console Firebase > Firestore > Rules.

---

## 🌐 Déploiement Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

---

## 🛠️ Variables à personnaliser

Dans `src/firebase/firestore.js` :
- `CITIES` : liste des villes desservies
- `TARIFS` : tarifs par ville en DH

Dans `src/pages/AgentPage.jsx` et `TrackingPage.jsx` :
- Remplacez `https://votre-site.ma` par votre vrai domaine

---

## 📦 Packages utilisés

| Package          | Usage                              |
|------------------|------------------------------------|
| firebase         | Auth, Firestore, Storage           |
| react-router-dom | Navigation et protection des routes|
| react-barcode    | Code-barres sur le ticket          |
| qrcode.react     | QR Code (optionnel)                |
| html5-qrcode     | Scanner QR via caméra              |
| react-to-print   | Impression du ticket 80mm          |
| lucide-react     | Icônes                             |
| tailwindcss      | Styles                             |
| vite-plugin-pwa  | PWA / Service Worker               |
