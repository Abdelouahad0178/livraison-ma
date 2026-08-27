import InternetStatus from '../components/InternetStatus'

export default function InternetStatusDemo() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            🌐 Indicateur de Connexion Internet
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Surveillez la qualité de votre connexion en temps réel
          </p>
        </div>

        {/* Démo principale - Grande carte centrée */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 mb-8">
          <div className="flex flex-col items-center justify-center">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
              État actuel de votre connexion
            </h2>
            <InternetStatus size="lg" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-6 text-center max-w-md">
              Le composant mesure automatiquement la latence toutes les 10 secondes et ajuste les couleurs selon la qualité.
            </p>
          </div>
        </div>

        {/* Exemples de tailles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
              Petite (sm)
            </h3>
            <div className="flex justify-center">
              <InternetStatus size="sm" />
            </div>
            <code className="block mt-4 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded">
              {'<InternetStatus size="sm" />'}
            </code>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
              Moyenne (md)
            </h3>
            <div className="flex justify-center">
              <InternetStatus size="md" />
            </div>
            <code className="block mt-4 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded">
              {'<InternetStatus size="md" />'}
            </code>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
              Grande (lg)
            </h3>
            <div className="flex justify-center">
              <InternetStatus size="lg" />
            </div>
            <code className="block mt-4 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded">
              {'<InternetStatus size="lg" />'}
            </code>
          </div>
        </div>

        {/* Exemple sans label */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Version compacte (sans label)
          </h3>
          <div className="flex items-center gap-6">
            <InternetStatus size="sm" showLabel={false} />
            <InternetStatus size="md" showLabel={false} />
            <InternetStatus size="lg" showLabel={false} />
          </div>
          <code className="block mt-4 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded">
            {'<InternetStatus size="sm" showLabel={false} />'}
          </code>
        </div>

        {/* Cas d'usage */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            💡 Cas d'usage recommandés
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Position fixe en haut */}
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 relative">
              <div className="absolute top-2 right-2">
                <InternetStatus size="sm" showLabel={false} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 pt-16">
                <strong>Position fixe</strong><br />
                Toujours visible en haut à droite de l'écran
              </p>
              <code className="block mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded">
                {'<div className="fixed top-4 right-4">\n  <InternetStatus size="sm" />\n</div>'}
              </code>
            </div>

            {/* Dans un dashboard */}
            <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">État système</h4>
                <InternetStatus size="sm" />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <strong>Dashboard KPI</strong><br />
                Intégré avec d'autres indicateurs de santé
              </p>
            </div>
          </div>
        </div>

        {/* Légende des couleurs */}
        <div className="mt-8 bg-gradient-to-r from-green-50 via-blue-50 via-orange-50 to-red-50 dark:from-green-900/20 dark:via-blue-900/20 dark:via-orange-900/20 dark:to-red-900/20 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
            🎨 Signification des couleurs
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-green-500 rounded-full mx-auto mb-2 shadow-lg shadow-green-500/50" />
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">Excellent</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">&lt; 100ms</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-500 rounded-full mx-auto mb-2 shadow-lg shadow-blue-500/50" />
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Bonne</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">100-300ms</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-orange-500 rounded-full mx-auto mb-2 shadow-lg shadow-orange-500/50" />
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">Faible</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">&gt; 300ms</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-red-500 rounded-full mx-auto mb-2 shadow-lg shadow-red-500/50" />
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Hors ligne</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Pas de réseau</p>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-400 mb-3">
            📋 Comment l'intégrer dans vos pages
          </h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-300">
            <li>Importez le composant: <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded">import InternetStatus from '../components/InternetStatus'</code></li>
            <li>Ajoutez-le dans votre JSX: <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded">{'<InternetStatus />'}</code></li>
            <li>Personnalisez avec les props <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded">size</code>, <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded">showLabel</code>, <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded">className</code></li>
          </ol>
        </div>
      </div>
    </div>
  )
}
