import { Wifi, WifiOff } from "lucide-react";
import { cn } from "../lib/utils";
import type { ConnectionStatus } from "../hooks/useConnection";

export const ConnectionIndicator = ({ status }: { status: ConnectionStatus }) => {
  const label = status === "healthy" ? "Connected" : status === "warning" ? "Reconnecting" : "Offline";

  return (
    <div
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium",
        status === "healthy" && "border-green-200 bg-green-50 text-brand-success",
        status === "warning" && "border-yellow-200 bg-yellow-50 text-yellow-700",
        status === "offline" && "border-red-200 bg-red-50 text-brand-danger"
      )}
    >
      {status === "offline" ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
      <span>{label}</span>
    </div>
  );
};
