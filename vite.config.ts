import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// copie o host gerado pelo ngrok aqui (troca a cada túnel se estiver no plano free)
const NGROK_HOST = "52a505452cce.ngrok-free.app";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "tamo fuuh",
        short_name: "tamo fuuh",
        description:
          "Finanças compartilhadas para casais — rápido, offline e simples.",
        theme_color: "#22cc5e",
        background_color: "#0f172a",
        start_url: "/",
        display: "standalone",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,       // escuta em 0.0.0.0
    port: 5173,       // mesma porta que você usa no ngrok
    strictPort: true,
    open: false,

    // 👇 libera o host do ngrok
    allowedHosts: [NGROK_HOST, ".ngrok-free.app"],

    // 👇 garante que o HMR funcione via wss
    hmr: {
      host: NGROK_HOST,
      protocol: "wss",
      clientPort: 443,
    },
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: [NGROK_HOST, ".ngrok-free.app"],
  },
});
