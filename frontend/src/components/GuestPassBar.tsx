import { cn } from "../lib/utils";

export const GuestPassBar = ({ total, used }: { total: number; used: number }) => {
  const safeTotal = Math.max(total, 0);
  const safeUsed = Math.min(Math.max(used, 0), safeTotal);
  const remaining = Math.max(safeTotal - safeUsed, 0);
  const segments = Math.max(Math.min(safeTotal, 8), safeTotal > 0 ? 1 : 0);
  const filledSegments = safeTotal === 0 ? 0 : Math.ceil((remaining / safeTotal) * segments);
  const colorClass = remaining === 0 ? "bg-brand-danger" : remaining <= 2 ? "bg-brand-warning" : "bg-brand-success";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-brand-navy">Guest passes</span>
        <span className="text-slate-600">
          {remaining}/{safeTotal} guest passes
        </span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(segments, 1)}, minmax(0, 1fr))` }}>
        {Array.from({ length: Math.max(segments, 1) }, (_, index) => (
          <span
            key={index}
            className={cn("h-2 rounded-full", index < filledSegments ? colorClass : "bg-slate-200 dark:bg-slate-600")}
          />
        ))}
      </div>
    </div>
  );
};
