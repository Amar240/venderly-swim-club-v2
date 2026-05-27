import { formatDistanceToNow } from "date-fns";
import { LogIn, LogOut } from "lucide-react";
import type { RecentActivityEvent } from "../lib/api";

export const ActivityFeedItem = ({ event }: { event: RecentActivityEvent }) => {
  const isSignOut = event.eventType === "sign_out";
  const Icon = isSignOut ? LogOut : LogIn;

  return (
    <div className="flex gap-3 rounded-lg border border-brand-border bg-white p-3">
      <div className={isSignOut ? "mt-0.5 text-brand-primary" : "mt-0.5 text-brand-success"}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-brand-navy">{event.personName}</p>
        <p className="text-sm text-slate-500">
          {isSignOut ? "Signed out" : "Checked in"} · {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
};
