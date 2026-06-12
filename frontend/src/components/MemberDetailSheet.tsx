import axios from "axios";
import { format } from "date-fns";
import {
  CalendarDays,
  CreditCard,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Ticket,
  Trash2,
  Undo2,
  UserPlus,
  X,
  type LucideIcon
} from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useManualSignout } from "../hooks/useDashboard";
import { useManualCheckin } from "../hooks/useManualCheckin";
import {
  useAddPerson,
  useDeletePerson,
  useRestorePerson,
  useUpdateAddress,
  useUpdateEmergency,
  useUpdatePerson
} from "../hooks/useMemberEdit";
import { useMemberDetail } from "../hooks/useMembers";
import { useMotion } from "../hooks/useMotion";
import type { MemberDetail, MemberDetailFamilyMember, MemberDetailResponse } from "../lib/api";
import { slideInRight } from "../lib/motion";
import { cn } from "../lib/utils";
import { GuestPassBar } from "./GuestPassBar";
import { StatusDot } from "./StatusDot";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Skeleton } from "./ui/skeleton";

const NO_ALLERGY_PATTERNS = /^(no|none|n\/?a|nothing|nope|no allergies|n|\/|-)$/i;

type EditingSection =
  | { type: "person"; personId: string }
  | { type: "address" }
  | { type: "emergency" }
  | null;

type PersonFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  age: string;
  relationship: string;
  allergies: string;
};

type AddressFormValues = {
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
};

type EmergencyFormValues = {
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
};

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
  const [editing, setEditing] = useState<EditingSection>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MemberDetailFamilyMember | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const clickedRowRef = useRef<HTMLDivElement | null>(null);
  const { reduced } = useMotion();
  const manualCheckin = useManualCheckin();
  const manualSignout = useManualSignout();
  const personMutation = useUpdatePerson(clickedPersonId, editing?.type === "person" ? editing.personId : "");
  const addressMutation = useUpdateAddress(member.membership.membershipId, clickedPersonId);
  const emergencyMutation = useUpdateEmergency(member.membership.membershipId, clickedPersonId);
  const addPersonMutation = useAddPerson(member.membership.membershipId, clickedPersonId);
  const deletePersonMutation = useDeletePerson(clickedPersonId);
  const restorePersonMutation = useRestorePerson(clickedPersonId);
  const queryClient = useQueryClient();

  useEffect(() => {
    setLocalStatus({});
    setGuestCount(0);
    setLocalActiveGuests({});
    setEditing(null);
    setAddingMember(false);
    setConfirmDelete(null);
    setShowHidden(false);
  }, [member.membership.membershipId]);

  const removePerson = (person: MemberDetailFamilyMember) => {
    deletePersonMutation.mutate(person.personId, {
      onSuccess: () => {
        toast.success(`${person.name} removed. They can be restored anytime.`);
        setConfirmDelete(null);
      },
      onError: (error) => {
        const code =
          axios.isAxiosError(error) && typeof error.response?.data?.error?.code === "string"
            ? error.response.data.error.code
            : null;
        toast.error(
          code === "PERSON_CHECKED_IN"
            ? "Sign them out before removing them."
            : code === "CANNOT_DELETE_PRIMARY"
              ? "The account holder cannot be removed."
              : "Couldn't remove the member."
        );
        setConfirmDelete(null);
      }
    });
  };

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
            const isEditingPerson = editing?.type === "person" && editing.personId === person.personId;

            if (isEditingPerson) {
              return (
                <PersonEditForm
                  key={person.personId}
                  person={person}
                  pending={personMutation.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(body) => {
                    if (Object.keys(body).length === 0) {
                      setEditing(null);
                      return;
                    }

                    personMutation.mutate(body, { onSuccess: () => setEditing(null) });
                  }}
                />
              );
            }

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
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Edit ${person.name}`}
                    onClick={() => setEditing({ type: "person", personId: person.personId })}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-brand-background hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!person.isPrimary && (
                    <button
                      type="button"
                      aria-label={`Remove ${person.name}`}
                      onClick={() => setConfirmDelete(person)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
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
              </div>
            );
          })}
          {addingMember ? (
            <AddMemberForm
              pending={addPersonMutation.isPending}
              onCancel={() => setAddingMember(false)}
              onSave={(body) => {
                addPersonMutation.mutate(body, {
                  onSuccess: (result) => {
                    const name = `${result.person.firstName} ${result.person.lastName}`.trim();
                    toast.success(
                      result.maxMembersIncreasedTo !== undefined
                        ? `${name} added. Membership expanded to ${result.maxMembersIncreasedTo} members.`
                        : `${name} added.`
                    );
                    setAddingMember(false);
                  }
                });
              }}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddingMember(true)}
              className="h-11 w-full border-dashed border-brand-border text-brand-navy"
            >
              <UserPlus className="h-4 w-4" />
              Add member
            </Button>
          )}
          {member.hiddenMembers.length > 0 && (
            <div className="rounded-xl border border-dashed border-brand-border">
              <button
                type="button"
                onClick={() => setShowHidden((value) => !value)}
                className="flex min-h-11 w-full items-center justify-between px-4 text-left text-sm font-semibold text-slate-500"
              >
                Hidden members ({member.hiddenMembers.length})
                <span className="text-brand-primary">{showHidden ? "Hide" : "Show"}</span>
              </button>
              {showHidden && (
                <div className="space-y-2 border-t border-dashed border-brand-border p-3">
                  {member.hiddenMembers.map((hidden) => (
                    <div
                      key={hidden.personId}
                      className="flex items-center justify-between rounded-lg bg-brand-background/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-500">{hidden.name}</p>
                        <p className="text-xs text-slate-400">{hidden.relationship}</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={restorePersonMutation.isPending}
                        onClick={() =>
                          restorePersonMutation.mutate(hidden.personId, {
                            onSuccess: () => toast.success(`${hidden.name} restored.`)
                          })
                        }
                        className="h-11 shrink-0 border-brand-border"
                      >
                        <Undo2 className="h-4 w-4" />
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {member.membership.currentGuestsInPool > 0 ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-brand-background/60 px-4 py-3 text-sm text-slate-600">
              <Ticket className="h-4 w-4 text-brand-primary" aria-hidden />
              <span>+{member.membership.currentGuestsInPool} guests currently in pool</span>
            </div>
          ) : null}
        </div>
      </section>

      <Dialog open={confirmDelete !== null} onOpenChange={(dialogOpen) => !dialogOpen && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {confirmDelete?.name} from this membership?</DialogTitle>
            <DialogDescription>
              They can be restored later. This does not delete their visit history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" disabled={deletePersonMutation.isPending} onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deletePersonMutation.isPending}
              onClick={() => confirmDelete && removePerson(confirmDelete)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deletePersonMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Details</h3>
        <div className="space-y-3 rounded-xl border border-brand-border p-4">
          {renderAllergyRows(member)}
          {editing?.type === "emergency" ? (
            <EmergencyEditForm
              accountHolder={accountHolder}
              pending={emergencyMutation.isPending}
              onCancel={() => setEditing(null)}
              onSave={(body) => {
                if (Object.keys(body).length === 0) {
                  setEditing(null);
                  return;
                }

                emergencyMutation.mutate(body, { onSuccess: () => setEditing(null) });
              }}
            />
          ) : (
            <EditableDetailRow
              icon={Phone}
              label="Emergency"
              value={[accountHolder.emergencyContactName, accountHolder.emergencyContactPhone, accountHolder.emergencyContactEmail]
                .filter(Boolean)
                .join(" · ")}
              emptyValue="No emergency contact on file"
              onEdit={() => setEditing({ type: "emergency" })}
            />
          )}
          {editing?.type === "address" ? (
            <AddressEditForm
              membership={member.membership}
              pending={addressMutation.isPending}
              onCancel={() => setEditing(null)}
              onSave={(body) => {
                if (Object.keys(body).length === 0) {
                  setEditing(null);
                  return;
                }

                addressMutation.mutate(body, { onSuccess: () => setEditing(null) });
              }}
            />
          ) : (
            <EditableDetailRow
              icon={MapPin}
              label="Address"
              value={address}
              emptyValue="No address on file"
              onEdit={() => setEditing({ type: "address" })}
            />
          )}
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

const PersonEditForm = ({
  person,
  pending,
  onCancel,
  onSave
}: {
  person: MemberDetailFamilyMember;
  pending: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) => {
  const initial: PersonFormValues = {
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
    age: person.age === null ? "" : String(person.age),
    relationship: person.relationship,
    allergies: person.allergies
  };
  const [form, setForm] = useState<PersonFormValues>(initial);

  const save = () => {
    if (!form.firstName.trim()) {
      toast.error("First name is required");
      return;
    }

    if (!form.relationship.trim()) {
      toast.error("Relationship is required");
      return;
    }

    const ageText = form.age.trim();
    const parsedAge = ageText === "" ? null : Number.parseInt(ageText, 10);

    if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 120)) {
      toast.error("Enter an age from 0 to 120");
      return;
    }

    const next = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone,
      age: parsedAge,
      relationship: form.relationship.trim(),
      allergies: form.allergies
    };
    const previous = {
      firstName: initial.firstName,
      lastName: initial.lastName,
      email: initial.email,
      phone: initial.phone,
      age: person.age,
      relationship: initial.relationship,
      allergies: initial.allergies
    };

    onSave(diffValues(previous, next));
  };

  return (
    <div className="rounded-xl border border-brand-border bg-brand-background p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <EditField label="First name">
          <Input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
        </EditField>
        <EditField label="Last name">
          <Input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
        </EditField>
        <EditField label="Email">
          <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </EditField>
        <EditField label="Phone">
          <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </EditField>
        <EditField label="Age">
          <Input
            inputMode="numeric"
            value={form.age}
            onChange={(event) => setForm({ ...form, age: event.target.value.replace(/[^\d]/g, "") })}
          />
        </EditField>
        <EditField label="Relationship">
          <Input value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} />
        </EditField>
        <div className="sm:col-span-2">
          <EditField label="Allergies / notes">
            <Input value={form.allergies} onChange={(event) => setForm({ ...form, allergies: event.target.value })} />
          </EditField>
        </div>
      </div>
      <EditActions pending={pending} onCancel={onCancel} onSave={save} />
    </div>
  );
};

const AddMemberForm = ({
  pending,
  onCancel,
  onSave
}: {
  pending: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) => {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    age: "",
    relationship: "family_member"
  });

  const save = () => {
    if (!form.firstName.trim()) {
      toast.error("First name is required");
      return;
    }

    const ageText = form.age.trim();
    const parsedAge = ageText === "" ? undefined : Number.parseInt(ageText, 10);

    if (parsedAge !== undefined && (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 120)) {
      toast.error("Enter an age from 0 to 120");
      return;
    }

    onSave({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone,
      ...(parsedAge !== undefined ? { age: parsedAge } : {}),
      relationship: form.relationship.trim() || "family_member"
    });
  };

  return (
    <div className="rounded-xl border border-brand-border bg-brand-background p-4">
      <p className="mb-3 text-sm font-semibold text-brand-navy">Add a member to this household</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <EditField label="First name">
          <Input autoFocus value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
        </EditField>
        <EditField label="Last name">
          <Input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
        </EditField>
        <EditField label="Email (optional)">
          <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </EditField>
        <EditField label="Phone (optional)">
          <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </EditField>
        <EditField label="Age (optional)">
          <Input
            inputMode="numeric"
            value={form.age}
            onChange={(event) => setForm({ ...form, age: event.target.value.replace(/[^\d]/g, "") })}
          />
        </EditField>
        <EditField label="Relationship">
          <Input value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} />
        </EditField>
      </div>
      <EditActions pending={pending} onCancel={onCancel} onSave={save} />
    </div>
  );
};

const AddressEditForm = ({
  membership,
  pending,
  onCancel,
  onSave
}: {
  membership: MemberDetail["membership"];
  pending: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) => {
  const initial: AddressFormValues = {
    addressStreet: membership.addressStreet,
    addressCity: membership.addressCity,
    addressState: membership.addressState,
    addressPostalCode: membership.addressPostalCode,
    addressCountry: membership.addressCountry
  };
  const [form, setForm] = useState<AddressFormValues>(initial);

  const save = () => {
    const next = {
      addressStreet: form.addressStreet.trim(),
      addressCity: form.addressCity.trim(),
      addressState: form.addressState.trim(),
      addressPostalCode: form.addressPostalCode.trim(),
      addressCountry: form.addressCountry.trim()
    };

    onSave(diffValues(initial, next));
  };

  return (
    <div className="rounded-lg bg-brand-background p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <EditField label="Street">
            <Input value={form.addressStreet} onChange={(event) => setForm({ ...form, addressStreet: event.target.value })} />
          </EditField>
        </div>
        <EditField label="City">
          <Input value={form.addressCity} onChange={(event) => setForm({ ...form, addressCity: event.target.value })} />
        </EditField>
        <EditField label="State">
          <Input value={form.addressState} onChange={(event) => setForm({ ...form, addressState: event.target.value })} />
        </EditField>
        <EditField label="Postal code">
          <Input value={form.addressPostalCode} onChange={(event) => setForm({ ...form, addressPostalCode: event.target.value })} />
        </EditField>
        <EditField label="Country">
          <Input value={form.addressCountry} onChange={(event) => setForm({ ...form, addressCountry: event.target.value })} />
        </EditField>
      </div>
      <EditActions pending={pending} onCancel={onCancel} onSave={save} />
    </div>
  );
};

const EmergencyEditForm = ({
  accountHolder,
  pending,
  onCancel,
  onSave
}: {
  accountHolder: Pick<MemberDetail, "emergencyContactName" | "emergencyContactPhone" | "emergencyContactEmail">;
  pending: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) => {
  const initial: EmergencyFormValues = {
    emergencyContactName: accountHolder.emergencyContactName,
    emergencyContactPhone: accountHolder.emergencyContactPhone,
    emergencyContactEmail: accountHolder.emergencyContactEmail
  };
  const [form, setForm] = useState<EmergencyFormValues>(initial);

  const save = () => {
    const next = {
      emergencyContactName: form.emergencyContactName.trim(),
      emergencyContactPhone: form.emergencyContactPhone,
      emergencyContactEmail: form.emergencyContactEmail.trim()
    };

    onSave(diffValues(initial, next));
  };

  return (
    <div className="rounded-lg bg-brand-background p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <EditField label="Name">
          <Input value={form.emergencyContactName} onChange={(event) => setForm({ ...form, emergencyContactName: event.target.value })} />
        </EditField>
        <EditField label="Phone">
          <Input value={form.emergencyContactPhone} onChange={(event) => setForm({ ...form, emergencyContactPhone: event.target.value })} />
        </EditField>
        <div className="sm:col-span-2">
          <EditField label="Email">
            <Input
              type="email"
              value={form.emergencyContactEmail}
              onChange={(event) => setForm({ ...form, emergencyContactEmail: event.target.value })}
            />
          </EditField>
        </div>
      </div>
      <EditActions pending={pending} onCancel={onCancel} onSave={save} />
    </div>
  );
};

const EditableDetailRow = ({
  icon: Icon,
  label,
  value,
  emptyValue,
  onEdit
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  emptyValue: string;
  onEdit: () => void;
}) => (
  <div className="flex gap-3 rounded-lg bg-brand-background p-3 text-brand-navy">
    <Icon className="mt-0.5 h-5 w-5 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className={cn("mt-1 font-medium", !value && "text-slate-500")}>{value || emptyValue}</p>
    </div>
    <button
      type="button"
      aria-label={`Edit ${label}`}
      onClick={onEdit}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
    >
      <Pencil className="h-4 w-4" />
    </button>
  </div>
);

const EditField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-1.5">
    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</Label>
    {children}
  </div>
);

const EditActions = ({
  pending,
  onCancel,
  onSave
}: {
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) => (
  <div className="mt-4 flex justify-end gap-2">
    <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
      Cancel
    </Button>
    <Button type="button" disabled={pending} onClick={onSave} className="bg-brand-primary hover:bg-brand-primaryHover">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Save
    </Button>
  </div>
);

const diffValues = (
  initial: Record<string, string | number | null>,
  next: Record<string, string | number | null>
): Record<string, unknown> =>
  Object.entries(next).reduce<Record<string, unknown>>((diff, [key, value]) => {
    if (initial[key] !== value) {
      diff[key] = value;
    }

    return diff;
  }, {});

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
