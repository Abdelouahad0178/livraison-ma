# 🌐 Indicateur de Connexion Internet

## Composant créé: `InternetStatus.tsx`

Un composant React qui affiche une **carte ronde** indiquant la qualité de connexion internet en temps réel.

## Fonctionnalités

✅ **Mesure automatique** de la latence toutes les 10 secondes  
✅ **4 niveaux de qualité** avec couleurs distinctes:
   - 🟢 **Excellent** (< 100ms) - Vert
   - 🔵 **Bonne** (100-300ms) - Bleu  
   - 🟠 **Faible** (> 300ms) - Orange
   - 🔴 **Hors ligne** - Rouge

✅ **Animations** (pulse, ping) pour un visuel vivant  
✅ **Mode sombre** automatique  
✅ **3 tailles** disponibles (sm, md, lg)  
✅ **Badge latence** en millisecondes  

---

## 📦 Utilisation

### 1️⃣ Import basique

\`\`\`tsx
import InternetStatus from '../components/InternetStatus'

// Dans votre composant
<InternetStatus />
\`\`\`

### 2️⃣ Options disponibles

\`\`\`tsx
<InternetStatus 
  size="sm"          // 'sm' | 'md' | 'lg' (défaut: 'md')
  showLabel={true}   // Afficher le texte (défaut: true)
  className="mt-4"   // Classes CSS additionnelles
/>
\`\`\`

---

## 🎨 Exemples d'intégration

### Dans la barre de navigation (Admin/Agent)

\`\`\`tsx
// Dans AdminPage.tsx ou AgentPage.tsx
<div className="fixed top-4 right-4 z-50">
  <InternetStatus size="sm" />
</div>
\`\`\`

### Dans un coin de la page

\`\`\`tsx
<div className="absolute bottom-4 right-4">
  <InternetStatus size="md" />
</div>
\`\`\`

### Dans un dashboard

\`\`\`tsx
<div className="grid grid-cols-3 gap-4">
  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
    <h3 className="text-sm font-medium mb-2">Connexion</h3>
    <InternetStatus size="lg" />
  </div>
  {/* Autres cartes... */}
</div>
\`\`\`

### Version compacte (sans label)

\`\`\`tsx
<InternetStatus size="sm" showLabel={false} />
\`\`\`

---

## 🎯 Exemple concret pour AdminPage

\`\`\`tsx
// Dans src/pages/AdminPage.tsx
import InternetStatus from '../components/InternetStatus'

export default function AdminPage() {
  return (
    <div className="relative min-h-screen">
      {/* Indicateur fixe en haut à droite */}
      <div className="fixed top-20 right-6 z-40">
        <InternetStatus size="sm" />
      </div>

      {/* Reste du contenu... */}
      <div className="container mx-auto p-6">
        {/* ... */}
      </div>
    </div>
  )
}
\`\`\`

---

## 📊 Comment ça marche

1. **Détection online/offline**: Utilise `navigator.onLine`
2. **Mesure de latence**: Ping vers Google Favicon toutes les 10s
3. **Qualité calculée**:
   - < 100ms → Excellent (vert)
   - 100-300ms → Bonne (bleu)
   - \> 300ms → Faible (orange)
   - Hors ligne → Offline (rouge)

---

## 🎨 Personnalisation

Les couleurs s'adaptent automatiquement au mode sombre et utilisent les couleurs Tailwind standard:
- `green-500` pour excellent
- `blue-500` pour bonne
- `orange-500` pour faible
- `red-500` pour offline

Pour changer les couleurs, modifiez l'objet \`colors\` dans le composant.

---

## ✅ Prêt à l'emploi!

Le composant est maintenant disponible. Il suffit de l'importer et de l'utiliser où vous voulez dans votre application.
