import { differenceInMinutes, format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { LogIn, LogOut } from "lucide-react";
import type { RecentActivityEvent } from "../lib/api";

/** Relative under an hour, clock time today, "Yesterday 11:21 PM" after that. */
const formatFeedTime = (iso: string): string => {
  const date = new Date(iso);

  if (differenceInMinutes(new Date(), date) < 60) {
    return formatDistanceToNow(date, { addSuffix: true });
  }

  if (isToday(date)) {
    return format(date, "h:mm a");
  }

  if (isYesterday(date)) {
    return `Yesterday ${format(date, "h:mm a")}`;
  }

  return format(date, "MMM d, h:mm a");
};

/** "12:21 to 12:26 PM" when both halves share a meridiem, otherwise both shown in full. */
const formatVisitRange = (checkedInAt: string, signedOutAt: string): string => {
  const inDate = new Date(checkedInAt);
  const outDate = new Date(signedOutAt);
  const sameMeridiem = format(inDate, "a") === format(outDate, "a");

  return sameMeridiem
    ? `${format(inDate, "h:mm")} to ${format(outDate, "h:mm a")}`
    : `${format(inDate, "h:mm a")} to ${format(outDate, "h:mm a")}`;
};

export const ActivityFeedItem = ({
  event,
  onOpenMember
}: {
  event: RecentActivityEvent;
  onOpenMember: (personId: string) => void;
}) => {
  const isCompletedVisit = Boolean(event.signedOutAt);
  const Icon = isCompletedVisit ? LogOut : LogIn;

  return (
    <button
      type="button"
      className="flex min-h-[56px] w-full cursor-pointer gap-3 rounded-lg border border-brand-border bg-white p-3 text-left transition-colors hover:bg-brand-background/60"
      onClick={() => onOpenMember(event.personId)}
    >
      <div className={isCompletedVisit ? "mt-0.5 text-brand-primary" : "mt-0.5 text-brand-success"}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-brand-navy">{event.personName}</p>
        <p className="text-sm text-slate-500">
          {isCompletedVisit && event.signedOutAt
            ? formatVisitRange(event.checkedInAt, event.signedOutAt)
            : `Checked in · ${formatFeedTime(event.checkedInAt)}`}
        </p>
      </div>
    </button>
  );
};
