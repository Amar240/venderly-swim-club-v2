import { Search, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MemberDetailSheet } from "../components/MemberDetailSheet";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { useMemberships } from "../hooks/useMembers";
import type { MembershipListItem } from "../lib/api";
import { cn } from "../lib/utils";

const IN_POOL_FILTER = "In pool";
const FILTERS = ["All", IN_POOL_FILTER, "Family", "Adult", "Student"];

const initials = (firstName: string, lastName: string): string => `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

// One neutral chip style for all tiers — per-tier colors implied meaning that doesn't exist.
const TIER_CHIP_CLASS = "bg-slate-100 text-slate-600";
const AVATAR_CLASS = "bg-brand-primary/10 text-brand-primary";

export const Members = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tier, setTier] = useState("All");
  const params = useParams();
  const navigate = useNavigate();
  // "In pool" is a client-side status filter; the API only understands tier filters.
  const membershipsQuery = useMemberships({ q: debouncedSearch, tier: tier === IN_POOL_FILTER ? "All" : tier });
  const selectedPersonId = params.id ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const inPoolCount = useMemo(
    () => membershipsQuery.data?.memberships.filter((membership) => membership.membersInPool > 0).length ?? 0,
    [membershipsQuery.data]
  );

  const visibleMemberships = useMemo(() => {
    const all = membershipsQuery.data?.memberships ?? [];
    const filtered = tier === IN_POOL_FILTER ? all.filter((membership) => membership.membersInPool > 0) : all;

    // In-pool households first (most in pool on top), then the existing order.
    return [...filtered].sort((first, second) => second.membersInPool - first.membersInPool);
  }, [membershipsQuery.data, tier]);

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
              {filter === IN_POOL_FILTER && inPoolCount > 0 ? `${IN_POOL_FILTER} (${inPoolCount})` : filter}
            </button>
          ))}
        </div>
      </div>

      {membershipsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <Skeleton key={item} className="h-32 w-full" />
          ))}
        </div>
      ) : visibleMemberships.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleMemberships.map((membership) => (
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
  const inPool = membership.membersInPool > 0;
  const passesRemaining = Math.max(0, membership.guestPassesTotal - membership.guestPassesUsed);

  return (
    <Card
      className={cn(
        "border-brand-border bg-brand-surface shadow-sm transition-transform duration-150",
        canOpen && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
        !canOpen && "opacity-70",
        inPool && "border-l-[3px] border-l-brand-primary"
      )}
      onClick={onOpen}
    >
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarFallback className={AVATAR_CLASS}>
              {initials(membership.accountHolderFirstName, membership.accountHolderLastName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-brand-navy">{membership.accountHolderName}</p>
          </div>
          <Badge className={TIER_CHIP_CLASS}>{membership.tier}</Badge>
        </div>

        {inPool ? (
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-success" aria-hidden />
            {membership.membersInPool} of {membership.familyCount} in pool
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {membership.familyCount} members ·{" "}
            <span className={cn("font-semibold", membership.status === "ACTIVE" ? "text-brand-success" : "text-brand-danger")}>
              {membership.status === "ACTIVE" ? "Active" : "Expired"}
            </span>
          </p>
        )}

        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Ticket className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {membership.guestPassesTotal === 0 ? "No guest passes" : `${passesRemaining} guest passes left`}
        </p>
      </CardContent>
    </Card>
  );
};
