import { Users, UserPlus, Ticket, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ActiveMemberRow } from "../components/ActiveMemberRow";
import { ActivityFeedItem } from "../components/ActivityFeedItem";
import { CapacityBar } from "../components/CapacityBar";
import { MemberDetailSheet } from "../components/MemberDetailSheet";
import { StatCard } from "../components/StatCard";
import { TopBar } from "../components/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { useActiveCheckins, useDashboardSearch, useDashboardSummary, useManualSignout, useRecentActivity } from "../hooks/useDashboard";
import { useConnection } from "../hooks/useConnection";
import { cn } from "../lib/utils";

export const Dashboard = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const summaryQuery = useDashboardSummary();
  const activeQuery = useActiveCheckins();
  const recentQuery = useRecentActivity();
  const searchQuery = useDashboardSearch(debouncedSearch);
  const manualSignout = useManualSignout();
  const connection = useConnection();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const summary = summaryQuery.data;
  const active = activeQuery.data;
  const recent = recentQuery.data;
  const searchMatches = searchQuery.data?.matches ?? [];
  const panelClass = cn("transition-opacity", connection.isOffline && "opacity-70");

  const signOut = (personId: string, name: string): void => {
    if (!window.confirm(`Sign out ${name}? They might still be at the pool.`)) {
      return;
    }

    manualSignout.mutate(personId, {
      onSuccess: (result) => toast.success(result.message),
      onError: () => toast.error("Could not sign out this member.")
    });
  };

  return (
    <div className="min-h-screen bg-brand-background">
      <TopBar />
      <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <Card className={cn("border-brand-border bg-white shadow-sm", panelClass)}>
          <CardContent className="grid gap-8 p-6 md:grid-cols-[1fr_320px] md:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-primary">Currently in pool</p>
              {summary ? (
                <h1 className="mt-2 text-5xl font-bold tracking-tight text-brand-navy md:text-6xl">
                  {summary.currentlyInPool}
                  <span className="ml-3 text-2xl font-semibold text-slate-500">swimmers</span>
                </h1>
              ) : (
                <Skeleton className="mt-3 h-16 w-72" />
              )}
            </div>
            <CapacityBar percent={summary?.capacityPercent ?? 0} capacity={summary?.poolCapacity ?? 0} />
          </CardContent>
        </Card>

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search members by name or email"
            className="h-14 border-brand-border bg-white pl-12 text-base shadow-sm"
          />
          {debouncedSearch.length >= 2 && searchMatches.length > 0 ? (
            <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-brand-border bg-white shadow-xl">
              {searchMatches.map((match) => (
                <button
                  type="button"
                  key={match.personId}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-brand-background"
                  onClick={() => {
                    setSelectedPersonId(match.personId);
                    setSearch("");
                  }}
                >
                  <span>
                    <span className="font-semibold text-brand-navy">
                      {match.firstName} {match.lastName}
                    </span>
                    <span className="ml-2 text-sm text-slate-500">{match.membershipTier}</span>
                  </span>
                  <span className={match.isCurrentlyIn ? "text-sm font-medium text-brand-success" : "text-sm text-slate-500"}>
                    {match.isCurrentlyIn ? "In pool" : match.membershipStatus}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <section className={cn("grid gap-6 lg:grid-cols-3", panelClass)}>
          <DashboardColumn title="Currently In Pool">
            {activeQuery.isLoading ? (
              <SkeletonList />
            ) : active?.persons.length ? (
              active.persons.map((person) => (
                <ActiveMemberRow
                  key={person.checkinEventId}
                  person={person}
                  onSignOut={signOut}
                  isSigningOut={manualSignout.isPending}
                />
              ))
            ) : (
              <EmptyState>🌊 Pool is quiet right now</EmptyState>
            )}
          </DashboardColumn>

          <DashboardColumn title="Recent Activity">
            {recentQuery.isLoading ? (
              <SkeletonList />
            ) : recent?.events.length ? (
              recent.events.map((event) => <ActivityFeedItem key={event.eventId} event={event} />)
            ) : (
              <EmptyState>No activity yet today</EmptyState>
            )}
          </DashboardColumn>

          <div className="space-y-4">
            <StatCard label="Visited today" value={summary?.visitedToday ?? 0} icon={Users} />
            <StatCard label="Guests today" value={summary?.guestsToday ?? 0} icon={Ticket} />
            <StatCard label="New members today" value={summary?.newMembersToday ?? 0} icon={UserPlus} />
          </div>
        </section>
      </main>
      <MemberDetailSheet personId={selectedPersonId} open={Boolean(selectedPersonId)} onOpenChange={(open) => !open && setSelectedPersonId(null)} />
    </div>
  );
};

const DashboardColumn = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card className="border-brand-border bg-white shadow-sm">
    <CardHeader>
      <CardTitle className="text-lg text-brand-navy">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">{children}</CardContent>
  </Card>
);

const SkeletonList = () => (
  <div className="space-y-3">
    <Skeleton className="h-16 w-full" />
    <Skeleton className="h-16 w-full" />
    <Skeleton className="h-16 w-full" />
  </div>
);

const EmptyState = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-dashed border-brand-border p-8 text-center text-slate-500">{children}</div>
);
