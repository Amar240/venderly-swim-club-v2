import { Progress } from "./ui/progress";
import { cn } from "../lib/utils";

export const CapacityBar = ({ percent, capacity }: { percent: number; capacity: number }) => {
  const clampedPercent = Math.min(Math.max(percent, 0), 100);
  const status = clampedPercent >= 90 ? "danger" : clampedPercent >= 70 ? "warning" : "success";

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-600">Capacity</span>
        <span className="font-semibold text-brand-navy">{Math.round(clampedPercent)}%</span>
      </div>
      <Progress
        value={clampedPercent}
        className={cn(
          "h-3 bg-slate-100 [&>div]:transition-all",
          status === "success" && "[&>div]:bg-brand-success",
          status === "warning" && "[&>div]:bg-brand-warning",
          status === "danger" && "[&>div]:bg-brand-danger"
        )}
      />
      <p className="text-xs text-slate-500">Pool capacity: {capacity} swimmers</p>
    </div>
  );
};
