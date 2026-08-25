// vite.config.ts
import { defineConfig } from "file:///C:/Users/chaab/Desktop/livraison-ma/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/chaab/Desktop/livraison-ma/node_modules/@vitejs/plugin-react-swc/index.js";
import tailwindcss from "file:///C:/Users/chaab/Desktop/livraison-ma/node_modules/@tailwindcss/vite/dist/index.mjs";
import { VitePWA } from "file:///C:/Users/chaab/Desktop/livraison-ma/node_modules/vite-plugin-pwa/dist/index.js";
var vite_config_default = defineConfig({
  test: {
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    environmentMatchGlobs: [
      ["src/__tests__/components/**", "jsdom"],
      ["src/__tests__/**", "node"]
    ],
    setupFiles: ["src/__tests__/setup.ts"]
  },
  build: {
    rollupOptions: {
      output: {
        // Le [hash] Rollup change automatiquement quand le contenu change
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          firebaseCore: ["firebase/app"],
          firebaseAuth: ["firebase/auth"],
          firebaseDb: ["firebase/firestore"],
          firebaseStorage: ["firebase/storage"],
          firebaseFunctions: ["firebase/functions"],
          chartjs: ["chart.js", "react-chartjs-2"],
          scanner: ["html5-qrcode"],
          barcode: ["react-barcode", "jsbarcode"],
          qrcode: ["qrcode.react"],
          icons: ["lucide-react"]
        }
      }
    },
    // Optimisations de build
    chunkSizeWarningLimit: 500,
    minify: "esbuild",
    cssCodeSplit: true,
    sourcemap: false
  },
  esbuild: {
    drop: ["console", "debugger"]
    // Retirer console.log en production
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom"],
    exclude: ["html5-qrcode"],
    esbuildOptions: void 0
    // Désactiver l'ancien esbuild
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Workbox gère l'invalidation par révision automatiquement
        cacheId: "bg-express",
        globPatterns: ["**/*.{css,html,ico,png,jpg,svg,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/__/, /\/[^/?]+\.[^/]+$/],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.js$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "js-chunks-cache",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 }
            }
          },
          {
            urlPattern: /\.(png|jpg|svg|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/(firestore|identitytoolkit|securetoken)\.googleapis\.com\/.*/i,
            handler: "NetworkOnly"
          }
        ]
      },
      manifest: {
        name: "BG Express - Gestion livraisons",
        short_name: "BG Express",
        description: "Gestion des exp\xE9ditions et livraisons",
        theme_color: "#1d4ed8",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      }
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxjaGFhYlxcXFxEZXNrdG9wXFxcXGxpdnJhaXNvbi1tYVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcY2hhYWJcXFxcRGVza3RvcFxcXFxsaXZyYWlzb24tbWFcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL2NoYWFiL0Rlc2t0b3AvbGl2cmFpc29uLW1hL3ZpdGUuY29uZmlnLnRzXCI7Ly8vIDxyZWZlcmVuY2UgdHlwZXM9XCJ2aXRlc3RcIiAvPlxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2MnXG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSAnQHRhaWx3aW5kY3NzL3ZpdGUnXG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJ1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICB0ZXN0OiB7XG4gICAgZ2xvYmFsczogdHJ1ZSxcbiAgICBleGNsdWRlOiBbJyoqL25vZGVfbW9kdWxlcy8qKicsICcqKi9kaXN0LyoqJywgJ2UyZS8qKiddLFxuICAgIGVudmlyb25tZW50TWF0Y2hHbG9iczogW1xuICAgICAgWydzcmMvX190ZXN0c19fL2NvbXBvbmVudHMvKionLCAnanNkb20nXSxcbiAgICAgIFsnc3JjL19fdGVzdHNfXy8qKicsICdub2RlJ10sXG4gICAgXSxcbiAgICBzZXR1cEZpbGVzOiBbJ3NyYy9fX3Rlc3RzX18vc2V0dXAudHMnXSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgLy8gTGUgW2hhc2hdIFJvbGx1cCBjaGFuZ2UgYXV0b21hdGlxdWVtZW50IHF1YW5kIGxlIGNvbnRlbnUgY2hhbmdlXG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAnYXNzZXRzL1tuYW1lXS1baGFzaF0uanMnLFxuICAgICAgICBjaHVua0ZpbGVOYW1lczogJ2Fzc2V0cy9bbmFtZV0tW2hhc2hdLmpzJyxcbiAgICAgICAgYXNzZXRGaWxlTmFtZXM6ICdhc3NldHMvW25hbWVdLVtoYXNoXS5bZXh0XScsXG4gICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgIHJlYWN0OiBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICdyZWFjdC1yb3V0ZXItZG9tJ10sXG4gICAgICAgICAgZmlyZWJhc2VDb3JlOiBbJ2ZpcmViYXNlL2FwcCddLFxuICAgICAgICAgIGZpcmViYXNlQXV0aDogWydmaXJlYmFzZS9hdXRoJ10sXG4gICAgICAgICAgZmlyZWJhc2VEYjogWydmaXJlYmFzZS9maXJlc3RvcmUnXSxcbiAgICAgICAgICBmaXJlYmFzZVN0b3JhZ2U6IFsnZmlyZWJhc2Uvc3RvcmFnZSddLFxuICAgICAgICAgIGZpcmViYXNlRnVuY3Rpb25zOiBbJ2ZpcmViYXNlL2Z1bmN0aW9ucyddLFxuICAgICAgICAgIGNoYXJ0anM6IFsnY2hhcnQuanMnLCAncmVhY3QtY2hhcnRqcy0yJ10sXG4gICAgICAgICAgc2Nhbm5lcjogWydodG1sNS1xcmNvZGUnXSxcbiAgICAgICAgICBiYXJjb2RlOiBbJ3JlYWN0LWJhcmNvZGUnLCAnanNiYXJjb2RlJ10sXG4gICAgICAgICAgcXJjb2RlOiBbJ3FyY29kZS5yZWFjdCddLFxuICAgICAgICAgIGljb25zOiBbJ2x1Y2lkZS1yZWFjdCddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIC8vIE9wdGltaXNhdGlvbnMgZGUgYnVpbGRcbiAgICBjaHVua1NpemVXYXJuaW5nTGltaXQ6IDUwMCxcbiAgICBtaW5pZnk6ICdlc2J1aWxkJyxcbiAgICBjc3NDb2RlU3BsaXQ6IHRydWUsXG4gICAgc291cmNlbWFwOiBmYWxzZSxcbiAgfSxcbiAgZXNidWlsZDoge1xuICAgIGRyb3A6IFsnY29uc29sZScsICdkZWJ1Z2dlciddLCAvLyBSZXRpcmVyIGNvbnNvbGUubG9nIGVuIHByb2R1Y3Rpb25cbiAgfSxcbiAgb3B0aW1pemVEZXBzOiB7XG4gICAgaW5jbHVkZTogWydyZWFjdCcsICdyZWFjdC1kb20nLCAncmVhY3Qtcm91dGVyLWRvbSddLFxuICAgIGV4Y2x1ZGU6IFsnaHRtbDUtcXJjb2RlJ10sXG4gICAgZXNidWlsZE9wdGlvbnM6IHVuZGVmaW5lZCwgLy8gRFx1MDBFOXNhY3RpdmVyIGwnYW5jaWVuIGVzYnVpbGRcbiAgfSxcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgdGFpbHdpbmRjc3MoKSxcbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgaW5qZWN0UmVnaXN0ZXI6ICdhdXRvJyxcbiAgICAgIHdvcmtib3g6IHtcbiAgICAgICAgY2xlYW51cE91dGRhdGVkQ2FjaGVzOiB0cnVlLFxuICAgICAgICBza2lwV2FpdGluZzogdHJ1ZSxcbiAgICAgICAgY2xpZW50c0NsYWltOiB0cnVlLFxuICAgICAgICAvLyBXb3JrYm94IGdcdTAwRThyZSBsJ2ludmFsaWRhdGlvbiBwYXIgclx1MDBFOXZpc2lvbiBhdXRvbWF0aXF1ZW1lbnRcbiAgICAgICAgY2FjaGVJZDogJ2JnLWV4cHJlc3MnLFxuICAgICAgICBnbG9iUGF0dGVybnM6IFsnKiovKi57Y3NzLGh0bWwsaWNvLHBuZyxqcGcsc3ZnLHdvZmYsd29mZjJ9J10sXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2s6ICcvaW5kZXguaHRtbCcsXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2tEZW55bGlzdDogWy9eXFwvX18vLCAvXFwvW14vP10rXFwuW14vXSskL10sXG4gICAgICAgIHJ1bnRpbWVDYWNoaW5nOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXJsUGF0dGVybjogL1xcL2Fzc2V0c1xcLy4qXFwuanMkL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya0ZpcnN0JyxcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnanMtY2h1bmtzLWNhY2hlJyxcbiAgICAgICAgICAgICAgbmV0d29ya1RpbWVvdXRTZWNvbmRzOiAzLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDgwLCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXFwuKHBuZ3xqcGd8c3ZnfGljbykkL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiAnQ2FjaGVGaXJzdCcsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ2ltYWdlcy1jYWNoZScsXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogNTAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvKGZpcmVzdG9yZXxpZGVudGl0eXRvb2xraXR8c2VjdXJldG9rZW4pXFwuZ29vZ2xlYXBpc1xcLmNvbVxcLy4qL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya09ubHknLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgbWFuaWZlc3Q6IHtcbiAgICAgICAgbmFtZTogJ0JHIEV4cHJlc3MgLSBHZXN0aW9uIGxpdnJhaXNvbnMnLFxuICAgICAgICBzaG9ydF9uYW1lOiAnQkcgRXhwcmVzcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnR2VzdGlvbiBkZXMgZXhwXHUwMEU5ZGl0aW9ucyBldCBsaXZyYWlzb25zJyxcbiAgICAgICAgdGhlbWVfY29sb3I6ICcjMWQ0ZWQ4JyxcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyNmZmZmZmYnLFxuICAgICAgICBkaXNwbGF5OiAnc3RhbmRhbG9uZScsXG4gICAgICAgIG9yaWVudGF0aW9uOiAncG9ydHJhaXQnLFxuICAgICAgICBzY29wZTogJy8nLFxuICAgICAgICBzdGFydF91cmw6ICcvJyxcbiAgICAgICAgaWNvbnM6IFtcbiAgICAgICAgICB7IHNyYzogJy9pY29uLTE5Mi5wbmcnLCBzaXplczogJzE5MngxOTInLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgIHsgc3JjOiAnL2ljb24tNTEyLnBuZycsIHNpemVzOiAnNTEyeDUxMicsIHR5cGU6ICdpbWFnZS9wbmcnLCBwdXJwb3NlOiAnYW55IG1hc2thYmxlJyB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9KSxcbiAgXSxcbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQ0EsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxXQUFXO0FBQ2xCLE9BQU8saUJBQWlCO0FBQ3hCLFNBQVMsZUFBZTtBQUV4QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNO0FBQUEsSUFDSixTQUFTO0FBQUEsSUFDVCxTQUFTLENBQUMsc0JBQXNCLGNBQWMsUUFBUTtBQUFBLElBQ3RELHVCQUF1QjtBQUFBLE1BQ3JCLENBQUMsK0JBQStCLE9BQU87QUFBQSxNQUN2QyxDQUFDLG9CQUFvQixNQUFNO0FBQUEsSUFDN0I7QUFBQSxJQUNBLFlBQVksQ0FBQyx3QkFBd0I7QUFBQSxFQUN2QztBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsZUFBZTtBQUFBLE1BQ2IsUUFBUTtBQUFBO0FBQUEsUUFFTixnQkFBZ0I7QUFBQSxRQUNoQixnQkFBZ0I7QUFBQSxR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
