import { format } from "date-fns";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Skeleton } from "./ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useMemberDetail } from "../hooks/useMembers";

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-hidden p-0 sm:max-w-xl">
        <ScrollArea className="h-full">
          <div className="p-6">
            <SheetHeader>
              <SheetTitle className="text-2xl text-brand-navy">{member?.name ?? "Member details"}</SheetTitle>
              <SheetDescription>{member ? `${member.membership.tier} · ${member.membership.status}` : "Loading member record"}</SheetDescription>
            </SheetHeader>

            {detailQuery.isLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : member ? (
              <Tabs defaultValue="overview" className="mt-6">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="family">Family</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-4 space-y-4">
                  <div className="rounded-lg border border-brand-border p-4">
                    <div className="grid gap-3 text-sm">
                      <Info label="Email" value={member.email || "Not provided"} />
                      <Info label="Phone" value={member.phone || "Not provided"} />
                      <Info label="Relationship" value={member.relationship} />
                      <Info label="Emergency contact" value={member.emergencyContactName || "Not provided"} />
                      <Info label="Emergency phone" value={member.emergencyContactPhone || "Not provided"} />
                      <Info label="Notes" value={member.notes || member.allergies || "None"} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-brand-border p-4">
                    <p className="font-semibold text-brand-navy">Membership</p>
                    <div className="mt-3 grid gap-3 text-sm">
                      <Info label="Tier" value={member.membership.tier} />
                      <Info label="Max members" value={String(member.membership.maxMembers)} />
                      <Info
                        label="Guest passes"
                        value={`${Math.max(member.membership.guestPassesTotal - member.membership.guestPassesUsed, 0)} remaining`}
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="family" className="mt-4 space-y-3">
                  {member.family.map((familyMember) => (
                    <div key={familyMember.personId} className="flex items-center justify-between rounded-lg border border-brand-border p-3">
                      <div>
                        <p className="font-semibold text-brand-navy">{familyMember.name}</p>
                        <p className="text-sm text-slate-500">{familyMember.relationship}</p>
                      </div>
                      <Badge variant={familyMember.isCurrentlyIn ? "default" : "secondary"}>
                        {familyMember.isCurrentlyIn ? "In pool" : familyMember.status}
                      </Badge>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="history" className="mt-4 space-y-3">
                  {member.history.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-brand-border p-6 text-center text-slate-500">No check-in history yet.</p>
                  ) : (
                    member.history.map((event) => (
                      <div key={event.eventId} className="rounded-lg border border-brand-border p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-brand-navy">{event.eventType === "sign_out" ? "Signed out" : "Checked in"}</p>
                          <Badge variant={event.isActive ? "default" : "outline"}>{event.isActive ? "Active" : "Closed"}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{format(new Date(event.checkedInAt), "MMM d, yyyy h:mm a")}</p>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <p className="mt-6 rounded-lg border border-dashed border-brand-border p-6 text-center text-slate-500">Member could not be loaded.</p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

const Info = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-brand-navy">{value}</span>
  </div>
);
