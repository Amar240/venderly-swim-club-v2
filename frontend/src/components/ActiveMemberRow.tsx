import { formatDistanceToNow } from "date-fns";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import type { ActiveCheckinPerson } from "../lib/api";

const initials = (firstName: string, lastName: string): string => `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

export const ActiveMemberRow = ({
  person,
  onSignOut,
  isSigningOut
}: {
  person: ActiveCheckinPerson;
  onSignOut: (personId: string, name: string) => void;
  isSigningOut: boolean;
}) => {
  const name = `${person.firstName} ${person.lastName}`.trim();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand-border bg-white p-3">
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-brand-background text-brand-navy">{initials(person.firstName, person.lastName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-brand-navy">{name}</p>
        <p className="text-sm text-slate-500">
          {formatDistanceToNow(new Date(person.checkedInAt), { addSuffix: true })}
          {person.numGuests > 0 ? ` · ${person.numGuests} guests` : ""}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={isSigningOut}
        onClick={() => onSignOut(person.personId, name)}
        className="shrink-0"
      >
        <LogOut className="mr-1 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
};
