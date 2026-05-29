import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

const DISMISS_KEY = "venderly.capacityBanner.dismissed";

export const CapacityBanner = ({ percent, capacity, current }: { percent: number; capacity: number; current: number }) => {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) !== null);
  const atCapacity = percent >= 100;

  useEffect(() => {
    if (!atCapacity) {
      sessionStorage.removeItem(DISMISS_KEY);
      setDismissed(false);
    }
  }, [atCapacity]);

  if (!atCapacity || dismissed) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-danger px-4 py-3 text-white shadow-sm">
      <p className="text-sm font-semibold">
        Pool at capacity — confirm new check-ins manually. <span className="whitespace-nowrap">({current}/{capacity})</span>
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Dismiss capacity alert"
        className="h-11 w-11 shrink-0 text-white hover:bg-white/15 hover:text-white"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, new Date().toISOString());
          setDismissed(true);
        }}
      >
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
};
