// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import AppRoot from "./AppRoot";
import "./index.css";

// ⬇️ registra o SW gerado pelo vite-plugin-pwa
import { registerSW } from "virtual:pwa-register";

const updateSW = registerSW({
  onNeedRefresh() {
    // você pode trocar por um toast/botão custom do seu UI
    if (confirm("Nova versão disponível. Atualizar agora?")) {
      updateSW();
    }
  },
  onOfflineReady() {
    console.log("App disponível offline!");
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
);
