// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

//const NGROK_HOST = process.env.NGROK_HOST || "52a505452cce.ngrok-free.app";
const isDev = process.env.NODE_ENV !== "production";
const NGROK_HOST = process.env.NGROK_HOST; // sem default
const useNgrok = !!NGROK_HOST;

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      workbox: {
        navigateFallbackDenylist: [/^\/__/], // evita conflitar com HMR/dev endpoints
        runtimeCaching: [
          // não cacheia agressivamente index.html
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html", networkTimeoutSeconds: 3 },
          },
        ],
      },
      devOptions: {
        enabled: false, // SW em dev costuma confundir; deixe off
      },
      manifest: {
        name: "tamo fuuh",
        short_name: "tamo fuuh",
        description: "Finanças compartilhadas para casais — rápido, offline e simples.",
        theme_color: "#22cc5e",
        background_color: "#0f172a",
        start_url: "/",
        display: "standalone",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    open: false,
    allowedHosts: useNgrok ? [NGROK_HOST!, ".ngrok-free.app"] : [],
    hmr: useNgrok ? { host: NGROK_HOST!, protocol: "wss", clientPort: 443 } : true,
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: useNgrok ? [NGROK_HOST!, ".ngrok-free.app"] : [],
  },
  build: {
    target: "es2020",
    sourcemap: true, // útil na Vercel para depuração
  },
});
