// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/maskable-512.png",   // 👈 adicione este arquivo em /public/icons
        "favicon.ico",
        "robots.txt",
        "apple-touch-icon.png"
      ],
      manifest: {
        name: "tamo fuuh",
        short_name: "tamo fuuh",
        description: "Finanças compartilhadas para casais — rápido, offline e simples.",
        start_url: "/?source=pwa",  // 👈 garante contexto PWA
        scope: "/",                 // 👈 necessário p/ WebAPK no Android
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f172a",
        theme_color: "#22cc5e",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" } // 👈 melhor atalho/recorte
        ],
        shortcuts: [
          { name: "Nova despesa", url: "/nova-despesa" },
          { name: "Insights", url: "/insights" }
        ]
      },
      devOptions: {
        enabled: false, // manter off no dev local pra evitar SW “grudado”
      },
      workbox: {
        // SPA fallback p/ rotas do React
        navigateFallback: "/index.html",
        // evita conflitar com endpoints internos do Vite
        navigateFallbackDenylist: [/^\/__/],

        // Estratégias de cache recomendadas
        runtimeCaching: [
          // HTML (não cachear agressivo)
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html",
              networkTimeoutSeconds: 3
            }
          },
          // JS/CSS/Workers
          {
            urlPattern: ({ request }) => ["script","style","worker"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "assets" }
          },
          // Imagens
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          // Chamada de APIs (ajuste domínios conforme usar)
          {
            urlPattern: ({ url }) =>
              url.origin.includes("googleapis.com") ||
              url.origin.includes("firebaseio.com"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 }
            }
          }
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true // 👈 facilita atualizar versão sem pedir reload manual
      }
    })
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { host: true, port: 5173, strictPort: true, open: false },
  preview: { host: true, port: 5173 },
  build: { target: "es2020", sourcemap: true }
});
