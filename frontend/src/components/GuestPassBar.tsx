import { cn } from "../lib/utils";

export const GuestPassBar = ({ total, used, usedToday = 0 }: { total: number; used: number; usedToday?: number }) => {
  const safeTotal = Math.max(total, 0);
  const safeUsed = Math.min(Math.max(used, 0), safeTotal);
  const remaining = Math.max(safeTotal - safeUsed, 0);
  const pct = safeTotal > 0 ? remaining / safeTotal : 0;
  const segments = Math.max(Math.min(safeTotal, 8), safeTotal > 0 ? 1 : 0);
  const filledSegments = safeTotal === 0 || remaining === 0 ? 0 : Math.ceil(pct * segments);
  const colorClass = remaining > 0 && pct > 0.5 ? "bg-brand-success" : remaining > 0 ? "bg-brand-warning" : "bg-slate-300";
  const label =
    safeTotal === 0
      ? "No guest passes purchased"
      : remaining === 0
        ? "No passes remaining"
        : `${remaining}/${safeTotal} guest passes`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-brand-navy">Guest passes</span>
        <span className="tabular-nums text-slate-600">{label}</span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(segments, 1)}, minmax(0, 1fr))` }}>
        {Array.from({ length: Math.max(segments, 1) }, (_, index) => (
          <span
            key={index}
            className={cn("h-2 rounded-full", index < filledSegments ? colorClass : "bg-slate-200")}
          />
        ))}
      </div>
      {usedToday > 0 ? <p className="text-xs tabular-nums text-slate-500">{usedToday} used today</p> : null}
    </div>
  );
};
