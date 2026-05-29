import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GuestPassBar } from "../components/GuestPassBar";
import { MemberDetailSheet } from "../components/MemberDetailSheet";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { useMemberships } from "../hooks/useMembers";
import type { MembershipListItem } from "../lib/api";
import { cn } from "../lib/utils";

const FILTERS = ["All", "Family", "Adult", "Student"];

const initials = (firstName: string, lastName: string): string => `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

const tierColor = (tier: string): string => {
  const normalized = tier.toLowerCase();

  if (normalized.includes("family")) {
    return "bg-blue-100 text-brand-primary";
  }

  if (normalized.includes("adult")) {
    return "bg-emerald-100 text-brand-success";
  }

  if (normalized.includes("student")) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-slate-100 text-brand-navy";
};

export const Members = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tier, setTier] = useState("All");
  const params = useParams();
  const navigate = useNavigate();
  const membershipsQuery = useMemberships({ q: debouncedSearch, tier });
  const selectedPersonId = params.id ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="sticky top-14 z-30 -mx-4 border-b border-brand-border bg-brand-background/95 px-4 py-4 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Members</h1>
            <p className="mt-1 text-slate-500">Search households and manage family check-ins.</p>
          </div>
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search members"
              className="h-14 border-brand-border bg-brand-surface pl-10 text-base"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setTier(filter)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors duration-150",
                tier === filter
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-brand-border bg-brand-surface text-slate-600"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {membershipsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <Skeleton key={item} className="h-52 w-full" />
          ))}
        </div>
      ) : membershipsQuery.data?.memberships.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {membershipsQuery.data.memberships.map((membership) => (
            <MembershipCard
              key={membership.membershipId}
              membership={membership}
              onOpen={() => {
                if (membership.accountHolderPersonId) {
                  navigate(`/members/${membership.accountHolderPersonId}`);
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-brand-border bg-brand-surface p-10 text-center text-slate-500">
          No members match these filters.
        </div>
      )}

      <MemberDetailSheet
        personId={selectedPersonId}
        open={Boolean(selectedPersonId)}
        onOpenChange={(open) => {
          if (!open) {
            navigate("/members");
          }
        }}
      />
    </main>
  );
};

const MembershipCard = ({ membership, onOpen }: { membership: MembershipListItem; onOpen: () => void }) => {
  const canOpen = Boolean(membership.accountHolderPersonId);

  return (
    <Card
      className={cn(
        "border-brand-border bg-brand-surface shadow-sm transition-transform duration-150",
        canOpen && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
        !canOpen && "opacity-70"
      )}
      onClick={onOpen}
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className={tierColor(membership.tier)}>
              {initials(membership.accountHolderFirstName, membership.accountHolderLastName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-brand-navy">{membership.accountHolderName}</p>
          </div>
          <Badge className={tierColor(membership.tier)}>{membership.tier}</Badge>
        </div>

        <GuestPassBar total={membership.guestPassesTotal} used={membership.guestPassesUsed} />

        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-600">{membership.familyCount} members</span>
          <span className={cn("font-semibold", membership.status === "ACTIVE" ? "text-brand-success" : "text-brand-danger")}>
            {membership.isAnyMemberCurrentlyIn ? "In pool" : membership.status === "ACTIVE" ? "Active" : "Expired"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
