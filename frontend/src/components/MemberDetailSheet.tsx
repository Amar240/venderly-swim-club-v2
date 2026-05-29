import { format } from "date-fns";
import { AlertTriangle, CalendarDays, CreditCard, MapPin, Phone, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useManualSignout } from "../hooks/useDashboard";
import { useManualCheckin } from "../hooks/useManualCheckin";
import { useMemberDetail } from "../hooks/useMembers";
import { useMotion } from "../hooks/useMotion";
import type { MemberDetail, MemberDetailFamilyMember } from "../lib/api";
import { slideInRight } from "../lib/motion";
import { cn } from "../lib/utils";
import { GuestPassBar } from "./GuestPassBar";
import { StatusDot } from "./StatusDot";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Skeleton } from "./ui/skeleton";

export const MemberDetailSheet = ({
  personId,
  open,
  onOpenChange
}: {
  personId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const detailQuery = useMemberDetail(open ? personId : null);
  const member = detailQuery.data?.member;
  const { reduced } = useMotion();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-hidden bg-brand-surface p-0 sm:max-w-2xl">
        <ScrollArea className="h-full">
          <motion.div
            initial={reduced ? false : "hidden"}
            animate="show"
            variants={reduced ? undefined : slideInRight}
            transition={{ duration: reduced ? 0 : 0.3, ease: "easeOut" }}
            className="p-5 sm:p-6"
          >
            {detailQuery.isLoading ? (
              <div className="space-y-4 pt-8">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-80 w-full" />
              </div>
            ) : member ? (
              <HouseholdSheetBody member={member} clickedPersonId={personId} />
            ) : (
              <p className="mt-12 rounded-lg border border-dashed border-brand-border p-6 text-center text-slate-500">
                Member could not be loaded.
              </p>
            )}
          </motion.div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

const HouseholdSheetBody = ({ member, clickedPersonId }: { member: MemberDetail; clickedPersonId: string | null }) => {
  const accountHolder = member.family.find((person) => person.isPrimary) ?? member;
  const [localStatus, setLocalStatus] = useState<Record<string, boolean>>({});
  const clickedRowRef = useRef<HTMLDivElement | null>(null);
  const { reduced } = useMotion();
  const manualCheckin = useManualCheckin();
  const manualSignout = useManualSignout();

  useEffect(() => {
    setLocalStatus({});
  }, [member.membership.membershipId]);

  useEffect(() => {
    if (clickedRowRef.current) {
      clickedRowRef.current.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }
  }, [clickedPersonId, reduced]);

  const address = formatAddress(member.membership);
  const allergyRows = member.family.filter((person) => person.allergies.trim().length > 0);

  const family = useMemo(
    () =>
      member.family.map((person) => ({
        ...person,
        isCurrentlyIn: localStatus[person.personId] ?? person.isCurrentlyIn
      })),
    [localStatus, member.family]
  );

  const checkIn = (person: MemberDetailFamilyMember) => {
    setLocalStatus((current) => ({ ...current, [person.personId]: true }));
    manualCheckin.mutate(
      {
        personId: person.personId,
        firstName: person.firstName,
        lastName: person.lastName,
        membershipTier: member.membership.tier
      },
      {
        onSuccess: (result) => toast.success(result.message),
        onError: () => {
          setLocalStatus((current) => ({ ...current, [person.personId]: person.isCurrentlyIn }));
          toast.error("Could not check in this member.");
        }
      }
    );
  };

  const signOut = (person: MemberDetailFamilyMember) => {
    setLocalStatus((current) => ({ ...current, [person.personId]: false }));
    manualSignout.mutate(person.personId, {
      onSuccess: (result) => toast.success(result.message),
      onError: () => {
        setLocalStatus((current) => ({ ...current, [person.personId]: person.isCurrentlyIn }));
        toast.error("Could not sign out this member.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <SheetHeader className="pr-10 text-left">
        <SheetTitle className="text-3xl font-bold text-brand-navy">{accountHolder.lastName} Family</SheetTitle>
        <SheetDescription className="text-base text-slate-500">Account holder: {accountHolder.name}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap gap-2">
        <Badge className="bg-brand-primary text-white">{member.membership.tier}</Badge>
        <Badge variant={member.membership.status === "ACTIVE" ? "default" : "destructive"}>{member.membership.status}</Badge>
      </div>

      <div className="rounded-xl border border-brand-border bg-brand-background/70 p-4">
        <GuestPassBar total={member.membership.guestPassesTotal} used={member.membership.guestPassesUsed} />
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Family members</h3>
        <div className="space-y-3">
          {family.map((person) => {
            const isClicked = person.personId === clickedPersonId;
            const isBusy = manualCheckin.isPending || manualSignout.isPending;

            return (
              <div
                key={person.personId}
                ref={isClicked ? clickedRowRef : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-brand-border bg-brand-surface p-3 transition-colors duration-150",
                  isClicked && "animate-clicked-ring bg-brand-primary/10"
                )}
              >
                <StatusDot active={person.isCurrentlyIn} pulseOnce={person.isCurrentlyIn} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-brand-navy">
                    {person.name} <span className="font-normal text-slate-500">· {person.relationship}</span>
                    {person.age !== null ? <span className="font-normal text-slate-500"> · {person.age}</span> : null}
                  </p>
                  <p className="text-sm text-slate-500">
                    {person.isCurrentlyIn && person.checkedInAt ? `since ${format(new Date(person.checkedInAt), "h:mm a")}` : person.phone || person.email}
                  </p>
                </div>
                {person.isCurrentlyIn ? (
                  <Button type="button" variant="outline" disabled={isBusy} onClick={() => signOut(person)} className="shrink-0">
                    Sign Out
                  </Button>
                ) : (
                  <Button type="button" disabled={isBusy} onClick={() => checkIn(person)} className="shrink-0 bg-brand-primary hover:bg-brand-primaryHover">
                    Check In
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Details</h3>
        <div className="space-y-3 rounded-xl border border-brand-border p-4">
          {allergyRows.map((person) => (
            <DetailRow
              key={person.personId}
              icon={AlertTriangle}
              label={`Allergies: ${person.name}`}
              value={person.allergies}
              danger
            />
          ))}
          <DetailRow
            icon={Phone}
            label="Emergency"
            value={[accountHolder.emergencyContactName, accountHolder.emergencyContactPhone, accountHolder.emergencyContactEmail]
              .filter(Boolean)
              .join(" · ")}
          />
          <DetailRow icon={MapPin} label="Address" value={address} />
          <DetailRow
            icon={CalendarDays}
            label="Member since"
            value={member.membership.submittedAt ? format(new Date(member.membership.submittedAt), "MMM d, yyyy") : ""}
          />
          {member.membership.paymentAmountCents > 0 ? (
            <DetailRow icon={CreditCard} label="Payment" value={`$${(member.membership.paymentAmountCents / 100).toFixed(0)}`} />
          ) : null}
        </div>
      </section>
    </div>
  );
};

const DetailRow = ({
  icon: Icon,
  label,
  value,
  danger = false
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  danger?: boolean;
}) => {
  if (!value) {
    return null;
  }

  return (
    <div className={cn("flex gap-3 rounded-lg p-3", danger ? "bg-red-50 text-red-700" : "bg-brand-background text-brand-navy")}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
        <p className="mt-1 font-medium">{value}</p>
      </div>
    </div>
  );
};

const formatAddress = (membership: MemberDetail["membership"]): string =>
  [membership.addressStreet, [membership.addressCity, membership.addressState, membership.addressPostalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
