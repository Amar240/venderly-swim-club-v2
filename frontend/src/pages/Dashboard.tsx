import { Users, UserPlus, Ticket, Search } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ActiveMemberRow } from "../components/ActiveMemberRow";
import { ActivityFeedItem } from "../components/ActivityFeedItem";
import { CapacityBar } from "../components/CapacityBar";
import { CapacityBanner } from "../components/CapacityBanner";
import { MemberDetailSheet } from "../components/MemberDetailSheet";
import { StatCard } from "../components/StatCard";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { useActiveCheckins, useDashboardSearch, useDashboardSummary, useManualSignout, useRecentActivity } from "../hooks/useDashboard";
import { useConnection } from "../hooks/useConnection";
import { useMotion } from "../hooks/useMotion";
import { useWakeLock } from "../hooks/useWakeLock";
import { staggerChildren } from "../lib/motion";
import { cn } from "../lib/utils";

export const Dashboard = () => {
  useWakeLock();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const summaryQuery = useDashboardSummary();
  const activeQuery = useActiveCheckins();
  const recentQuery = useRecentActivity();
  const searchQuery = useDashboardSearch(debouncedSearch);
  const manualSignout = useManualSignout();
  const connection = useConnection();
  const { reduced } = useMotion();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const summary = summaryQuery.data;
  const active = activeQuery.data;
  const recent = recentQuery.data;
  const searchMatches = debouncedSearch.trim().length >= 2 ? searchQuery.data?.matches ?? [] : [];
  const panelClass = cn("transition-opacity", connection.isOffline && "opacity-70");

  const openMember = (personId: string): void => {
    setSelectedPersonId(personId);
  };

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
    <>
      <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {summary ? (
          <CapacityBanner percent={summary.capacityPercent} capacity={summary.poolCapacity} current={summary.currentlyInPool} />
        ) : null}
        <Card className={cn("border-brand-border bg-brand-surface shadow-sm", panelClass)}>
          <CardContent className="grid gap-8 p-6 md:grid-cols-[1fr_320px] md:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-primary">Currently in pool</p>
              {summary ? (
                <>
                  <h1 className="mt-2 text-5xl font-bold tracking-tight text-brand-navy md:text-6xl">
                    <AnimatedNumber value={summary.currentlyInPool} reduced={reduced} />
                    <span className="ml-3 text-2xl font-semibold text-slate-500">
                      {summary.currentlyInPool === 1 ? "swimmer" : "swimmers"}
                    </span>
                  </h1>
                  {summary.currentlyInPoolGuests > 0 ? (
                    <p className="mt-1 text-sm text-slate-500">
                      {summary.currentlyInPoolMembers} member{summary.currentlyInPoolMembers === 1 ? "" : "s"}
                      {" · "}
                      {summary.currentlyInPoolGuests} guest{summary.currentlyInPoolGuests === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </>
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
          {debouncedSearch.trim().length >= 2 && searchMatches.length > 0 ? (
            <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-brand-border bg-brand-surface shadow-xl">
              {searchMatches.map((match) => (
                <button
                  type="button"
                  key={match.personId}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-background disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    setSelectedPersonId(match.personId);
                    setSearch("");
                    setDebouncedSearch("");
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-brand-navy">
                      {[match.firstName, match.lastName].filter(Boolean).join(" ")}
                    </span>
                    <span className="text-sm text-slate-500">
                      {match.membershipTier} · {match.familyMembers.length + 1} family members
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {match.isCurrentlyIn ? (
                      <Badge className="bg-brand-success text-white">In pool</Badge>
                    ) : null}
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
              <motion.div
                initial={reduced ? false : "hidden"}
                animate="show"
                variants={reduced ? undefined : staggerChildren}
                className="space-y-3"
              >
                {active.persons.map((person) => (
                  <ActiveMemberRow
                    key={person.checkinEventId}
                    person={person}
                    onSignOut={signOut}
                    onOpenMember={openMember}
                    isSigningOut={manualSignout.isPending}
                  />
                ))}
              </motion.div>
            ) : (
              <EmptyState>🌊 Pool is quiet right now</EmptyState>
            )}
          </DashboardColumn>

          <DashboardColumn title="Recent Activity">
            {recentQuery.isLoading ? (
              <SkeletonList />
            ) : recent?.events.length ? (
              recent.events.map((event) => <ActivityFeedItem key={event.eventId} event={event} onOpenMember={openMember} />)
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
    </>
  );
};

const AnimatedNumber = ({ value, reduced }: { value: number; reduced: boolean }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    if (reduced) {
      displayRef.current = value;
      setDisplayValue(value);
      return undefined;
    }

    const start = displayRef.current;
    const change = value - start;
    const startTime = performance.now();
    const duration = 600;
    let frame = 0;

    const tick = (time: number) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const nextValue = Math.round(start + change * progress);
      displayRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, value]);

  return <span>{displayValue}</span>;
};

const DashboardColumn = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card className="border-brand-border bg-brand-surface shadow-sm">
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
