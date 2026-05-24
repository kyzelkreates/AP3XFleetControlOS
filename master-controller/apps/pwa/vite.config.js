import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name:             "AP3X Driver",
        short_name:       "AP3X",
        description:      "AP3X offline-first driver runtime — route execution, hazard reporting, tachograph logging.",
        start_url:        "/",
        scope:            "/",
        display:          "standalone",
        orientation:      "portrait-primary",
        background_color: "#0a0a0f",
        theme_color:      "#00e5ff",
        categories:       ["navigation","logistics","productivity"],
        icons: [
          { src:"icons/icon-192.png", sizes:"192x192", type:"image/png", purpose:"any maskable" },
          { src:"icons/icon-512.png", sizes:"512x512", type:"image/png", purpose:"any maskable" }
        ]
      },
      workbox: {
        // Cache the app shell
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Runtime caching strategies
        runtimeCaching: [
          {
            // API calls — network first, fall back to cache
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "ap3x-api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // OSM tile network — cache first, very long TTL
            urlPattern: /tile\.openstreetmap\.org/,
            handler: "CacheFirst",
            options: {
              cacheName: "ap3x-tiles-osm",
              expiration: { maxEntries: 2000, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Google Fonts — stale while revalidate
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "ap3x-fonts" }
          }
        ]
      }
    })
  ],
  base: "/",
  build: {
    outDir: "../../ui/pwa-dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Chunk splitting for offline performance
        manualChunks: {
          vendor: ["react","react-dom"],
        }
      }
    }
  },
  server: {
    port: 3003,
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } }
  }
});
