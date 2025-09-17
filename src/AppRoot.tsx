// src/AppRoot.tsx
import RequireAuth from "@/components/auth/RequireAuth";
import SetupCouple from "@/pages/SetupCouple";
import Dashboard from "@/pages/Dashboard";
import { useStore } from "@/store";
// import DevTools from "@/components/dev/Devtools"
// import DebugCouple from "@/components/dev/DebugCouple";

function Body() {
  const profile = useStore((s) => s.profile);
  const couple  = useStore((s) => s.couple);

  // 1) Enquanto ainda não sabemos o casal
  if (couple === undefined) {
    return <div className="p-4 text-xs opacity-70">carregando casal…</div>;
  }

  // 2) Sem coupleId no perfil → fluxo de criação/entrada (SetupCouple)
  if (!profile?.coupleId) {
    return <SetupCouple />;
  }

  // 3) Tem coupleId, mas não achou o doc do casal (ou você não é membro) → tratar como “sem casal”
  if (couple === null) {
    return <SetupCouple />;
  }

  // 4) Snapshot carregou um casal diferente do apontado no perfil → aguarda sincronizar
  if (couple.id !== profile.coupleId) {
    return <div className="p-4 text-xs opacity-70">carregando casal…</div>;
  }

  // 5) Casal existe mas está incompleto → exige SetupCouple
  const missingNames =
    !couple?.nameA || String(couple.nameA).trim() === "" ||
    !couple?.nameB || String(couple.nameB).trim() === "";

  if (missingNames) {
    return <SetupCouple />;
  }

  // 6) Tudo certo → Dashboard
  return <Dashboard />;
}

export default function AppRoot() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-xl mx-auto">
        <RequireAuth fallback={<div className="p-4 text-xs opacity-70">carregando…</div>}>
          <Body />
          {/* <DevTools /> */}
          {/* <DebugCouple /> */}
        </RequireAuth>
      </div>
    </div>
  );
}
