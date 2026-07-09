/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    environmentMatchGlobs: [
      ['src/__tests__/components/**', 'jsdom'],
      ['src/__tests__/**', 'node'],
    ],
    setupFiles: ['src/__tests__/setup.ts'],
  },
  build: {
    rollupOptions: {
      output: {
        // Le [hash] Rollup change automatiquement quand le contenu change
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          firebaseCore: ['firebase/app'],
          firebaseAuth: ['firebase/auth'],
          firebaseDb: ['firebase/firestore'],
          firebaseStorage: ['firebase/storage'],
          firebaseFunctions: ['firebase/functions'],
          chartjs: ['chart.js', 'react-chartjs-2'],
          scanner: ['html5-qrcode'],
          barcode: ['react-barcode', 'jsbarcode'],
          qrcode: ['qrcode.react'],
          icons: ['lucide-react'],
        },
      },
    },
    // Optimisations de build
    chunkSizeWarningLimit: 500,
    minify: 'esbuild',
    cssCodeSplit: true,
    sourcemap: false,
  },
  esbuild: {
    drop: ['console', 'debugger'], // Retirer console.log en production
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
    exclude: ['html5-qrcode', 'recharts'],
    esbuildOptions: undefined, // Désactiver l'ancien esbuild
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Workbox gère l'invalidation par révision automatiquement
        cacheId: 'bg-express',
        globPatterns: ['**/*.{css,html,ico,png,jpg,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__/, /\/[^/?]+\.[^/]+$/],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.js$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'js-chunks-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /\.(png|jpg|svg|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'BG Express - Gestion livraisons',
        short_name: 'BG Express',
        description: 'Gestion des expéditions et livraisons',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
