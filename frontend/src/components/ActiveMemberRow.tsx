import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { StatusDot } from "./StatusDot";
import type { ActiveCheckinPerson } from "../lib/api";

const initials = (firstName: string, lastName: string): string => `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

export const ActiveMemberRow = ({
  person,
  onSignOut,
  onOpenMember,
  isSigningOut
}: {
  person: ActiveCheckinPerson;
  onSignOut: (personId: string, name: string) => void;
  onOpenMember: (personId: string) => void;
  isSigningOut: boolean;
}) => {
  const name = `${person.firstName} ${person.lastName}`.trim();

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
      className="flex min-h-[56px] items-center gap-3 rounded-lg border border-brand-border bg-brand-surface p-3 transition-colors hover:bg-brand-background/60"
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        onClick={() => onOpenMember(person.personId)}
      >
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-brand-background text-brand-navy">{initials(person.firstName, person.lastName)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 truncate font-semibold text-brand-navy">
            <StatusDot active pulseOnce />
            {name}
          </span>
          <span className="block text-sm text-slate-500">
            {formatDistanceToNow(new Date(person.checkedInAt), { addSuffix: true })}
            {person.numGuests > 0 ? ` · ${person.numGuests} guests` : ""}
          </span>
        </span>
      </button>
      <Button
        size="sm"
        variant="outline"
        disabled={isSigningOut}
        onClick={(event) => {
          event.stopPropagation();
          onSignOut(person.personId, name);
        }}
        className="shrink-0"
      >
        <LogOut className="mr-1 h-4 w-4" />
        Sign Out
      </Button>
    </motion.div>
  );
};
