// src/components/pwa/InstallButton.tsx
import { useEffect, useState } from "react";

export default function InstallButton() {
  const [deferred, setDeferred] = useState<any>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setSupported(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice; // { outcome: "accepted" | "dismissed" }
    setDeferred(null);
    setSupported(false);
  };

  if (!supported) return null;

  return (
    <button
      onClick={install}
      className="px-3 py-2 rounded-xl border border-slate-600 hover:bg-slate-800"
      title="Instalar aplicativo"
    >
      Instalar app
    </button>
  );
}
