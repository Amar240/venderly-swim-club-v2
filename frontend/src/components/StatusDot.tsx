import { useMotion } from "../hooks/useMotion";
import { cn } from "../lib/utils";

export const StatusDot = ({ active, pulseOnce = false }: { active: boolean; pulseOnce?: boolean }) => {
  const { reduced } = useMotion();

  return (
    <span className="relative inline-flex h-3 w-3 items-center justify-center" aria-label={active ? "In pool" : "Not in pool"}>
      {active && pulseOnce && !reduced ? (
        <span className="absolute inline-flex h-full w-full animate-status-pulse rounded-full bg-brand-success opacity-60" />
      ) : null}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", active ? "bg-brand-success" : "bg-slate-300")} />
    </span>
  );
};
