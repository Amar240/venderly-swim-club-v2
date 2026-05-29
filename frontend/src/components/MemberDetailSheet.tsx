import { format } from "date-fns";
import { CalendarDays, CreditCard, Loader2, MapPin, Phone, Ticket, X, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useManualSignout } from "../hooks/useDashboard";
import { useManualCheckin } from "../hooks/useManualCheckin";
import { useMemberDetail } from "../hooks/useMembers";
import { useMotion } from "../hooks/useMotion";
import type { MemberDetail, MemberDetailFamilyMember, MemberDetailResponse } from "../lib/api";
import { slideInRight } from "../lib/motion";
import { cn } from "../lib/utils";
import { GuestPassBar } from "./GuestPassBar";
import { StatusDot } from "./StatusDot";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Skeleton } from "./ui/skeleton";

const NO_ALLERGY_PATTERNS = /^(no|none|n\/?a|nothing|nope|no allergies|n|\/|-)$/i;

const hasReportedAllergy = (text: string | null | undefined): boolean => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !NO_ALLERGY_PATTERNS.test(trimmed);
};

const renderAllergyRows = (member: MemberDetail) => {
  const withAllergies = (member.family ?? [member]).filter((person) => hasReportedAllergy(person.allergies));

  if (withAllergies.length === 0) {
    return null;
  }

  const allergiesSet = new Set(withAllergies.map((person) => person.allergies.trim().toLowerCase()));

  if (allergiesSet.size === 1) {
    return (
      <div className="rounded-lg border border-brand-border bg-white px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Household allergies / notes
        </div>
        <div className="mt-1 text-sm text-brand-navy">{withAllergies[0].allergies}</div>
      </div>
    );
  }

  return withAllergies.map((person) => (
    <div key={person.personId} className="rounded-lg border border-brand-border bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Allergies / Notes: {person.firstName} {person.lastName}
      </div>
      <div className="mt-1 text-sm text-brand-navy">{person.allergies}</div>
    </div>
  ));
};

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
        <button
          type="button"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-brand-border bg-white text-brand-navy shadow-sm transition-colors hover:bg-brand-background focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
        >
          <X className="h-5 w-5" />
        </button>
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
  const [guestCount, setGuestCount] = useState(0);
  const [localActiveGuests, setLocalActiveGuests] = useState<Record<string, number>>({});
  const clickedRowRef = useRef<HTMLDivElement | null>(null);
  const { reduced } = useMotion();
  const manualCheckin = useManualCheckin();
  const manualSignout = useManualSignout();
  const queryClient = useQueryClient();

  useEffect(() => {
    setLocalStatus({});
    setGuestCount(0);
    setLocalActiveGuests({});
  }, [member.membership.membershipId]);

  useEffect(() => {
    if (clickedRowRef.current) {
      clickedRowRef.current.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }
  }, [clickedPersonId, reduced]);

  const address = formatAddress(member.membership);
  const guestPassesRemaining = Math.max(0, member.membership.guestPassesTotal - member.membership.guestPassesUsed);
  const canDecrementGuests = guestCount > 0;
  const canIncrementGuests = guestCount < guestPassesRemaining;

  const family = useMemo(
    () =>
      member.family.map((person) => ({
        ...person,
        isCurrentlyIn: localStatus[person.personId] ?? person.isCurrentlyIn
      })),
    [localStatus, member.family]
  );

  const checkIn = (person: MemberDetailFamilyMember) => {
    const numGuests = Math.min(guestCount, guestPassesRemaining);

    setLocalStatus((current) => ({ ...current, [person.personId]: true }));
    manualCheckin.mutate(
      {
        personId: person.personId,
        firstName: person.firstName,
        lastName: person.lastName,
        membershipTier: member.membership.tier,
        numGuests,
        detailPersonId: clickedPersonId
      },
      {
        onSuccess: () => {
          setGuestCount(0);
          setLocalActiveGuests((current) => ({ ...current, [person.personId]: numGuests }));
        },
        onError: () => {
          setLocalStatus((current) => ({ ...current, [person.personId]: person.isCurrentlyIn }));
        }
      }
    );
  };

  const signOut = (person: MemberDetailFamilyMember) => {
    setLocalStatus((current) => ({ ...current, [person.personId]: false }));
    const guestsToRemove = localActiveGuests[person.personId] ?? 0;

    if (guestsToRemove > 0 && clickedPersonId) {
      queryClient.setQueryData<MemberDetailResponse>(["members", "detail", clickedPersonId], (current) =>
        current
          ? {
              member: {
                ...current.member,
                membership: {
                  ...current.member.membership,
                  currentGuestsInPool: Math.max(0, current.member.membership.currentGuestsInPool - guestsToRemove)
                },
                family: current.member.family.map((familyMember) =>
                  familyMember.personId === person.personId
                    ? { ...familyMember, isCurrentlyIn: false, checkedInAt: null }
                    : familyMember
                )
              }
            }
          : current
      );
    }

    manualSignout.mutate(person.personId, {
      onSuccess: (result) => {
        setLocalActiveGuests((current) => ({ ...current, [person.personId]: 0 }));
        toast.success(result.message);
      },
      onError: () => {
        setLocalStatus((current) => ({ ...current, [person.personId]: person.isCurrentlyIn }));
        if (guestsToRemove > 0 && clickedPersonId) {
          queryClient.invalidateQueries({ queryKey: ["members", "detail", clickedPersonId] }).catch(() => {});
        }
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
        <GuestPassBar
          total={member.membership.guestPassesTotal}
          used={member.membership.guestPassesUsed}
          usedToday={member.membership.guestPassesUsedToday}
        />
      </div>

      {guestPassesRemaining > 0 ? (
        <div className="rounded-lg border border-brand-border bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-brand-navy">Add guests</p>
              <p className="text-xs text-slate-500">
                Up to {guestPassesRemaining} guest{guestPassesRemaining === 1 ? "" : "s"} available
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease guests"
                disabled={!canDecrementGuests}
                onClick={() => setGuestCount((count) => Math.max(0, count - 1))}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-brand-border text-xl font-semibold text-brand-navy hover:bg-brand-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                -
              </button>
              <span className="min-w-[3ch] text-center text-2xl font-bold tabular-nums text-brand-navy">{guestCount}</span>
              <button
                type="button"
                aria-label="Increase guests"
                disabled={!canIncrementGuests}
                onClick={() => setGuestCount((count) => Math.min(guestPassesRemaining, count + 1))}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-brand-primary bg-brand-primary text-xl font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
          {guestCount > 0 ? (
            <p className="mt-2 text-xs text-slate-500">Will apply to the next family member checked in.</p>
          ) : null}
        </div>
      ) : null}

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
                    {manualCheckin.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Check In
                  </Button>
                )}
              </div>
            );
          })}
          {member.membership.currentGuestsInPool > 0 ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-brand-background/60 px-4 py-3 text-sm text-slate-600">
              <Ticket className="h-4 w-4 text-brand-primary" aria-hidden />
              <span>+{member.membership.currentGuestsInPool} guests currently in pool</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Details</h3>
        <div className="space-y-3 rounded-xl border border-brand-border p-4">
          {renderAllergyRows(member)}
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
