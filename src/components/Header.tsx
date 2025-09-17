// src/components/Header.tsx (exemplo)
import { logout } from "@/lib/firebase";
import { useStore } from "@/store";
import { devNukeAll } from "@/lib/firebase";

export default function Header() {
  const couple = useStore((s) => s.couple);
  const label =
    couple?.nameA && couple?.nameB
      ? `${couple.nameA} & ${couple.nameB}`
      : couple?.id
      ? "carregando casal…"
      : "sem casal";

  return (
    <header className="flex items-center justify-between text-xs opacity-80 mb-4">
      <div>FINANÇAS EM CASAL</div>
      <div className="flex items-center gap-3">
        <span>{label}</span>
        <button className="underline" onClick={logout}>
          sair
        </button>
        <button onClick={() => devNukeAll()} className="text-xs opacity-70 underline">
  Resetar ambiente (DEV)
</button>
      </div>
    </header>
  );
}
