import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Livraison MA',
        short_name: 'Livraison',
        description: 'Application de gestion de livraisons',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 1. Séparer Firebase en morceaux plus petits
          'firebase-core': ['firebase/app'],
          'firebase-auth': ['firebase/auth'],
          'firebase-firestore': ['firebase/firestore'],
          'firebase-storage': ['firebase/storage'],
          'firebase-functions': ['firebase/functions'],

          // 2. Séparer React et ses dépendances
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],

          // 3. Charts en chunk séparé (déjà lazy loaded)
          'charts': ['recharts'],

          // 4. UI components
          'ui-components': ['lucide-react'],

          // 5. Barcode libs
          'barcode': ['react-barcode', 'jsbarcode'],

          // 6. QR Code
          'qrcode': ['qrcode.react']
        }
      }
    },
    // Optimisations supplémentaires
    chunkSizeWarningLimit: 500, // Avertir si chunk > 500 KB
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Supprimer console.log en production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      }
    }
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore'
    ],
    exclude: [
      // Scanner très lourd - lazy load seulement quand nécessaire
      'html5-qrcode',
      // Charts - lazy load
      'recharts'
    ]
  }
})
