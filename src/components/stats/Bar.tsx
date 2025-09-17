// src/components/stats/Bar.tsx
type Props = {
    label: string;
    value: number;
    max: number;
    color: string;
    right?: string;
  };
  
  export default function Bar({ label, value, max, color, right }: Props) {
    const pct = Math.max(4, Math.round((value / (max || 1)) * 100));
  
    return (
      <div className="w-full">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="opacity-80">{label}</span>
          {right && <span className="opacity-80">{right}</span>}
        </div>
        <div className="h-3 w-full rounded bg-slate-800 overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  