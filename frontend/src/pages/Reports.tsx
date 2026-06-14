import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Clock, Copy, Download, Gauge, RefreshCw, Ticket, Users } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { getReportsSummary, type ReportRange, type ReportsSummary } from "../lib/api";
import { cn } from "../lib/utils";

const RANGES: Array<{ value: ReportRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "season", label: "Season" }
];

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" }
];

const HEATMAP_HOURS = Array.from({ length: 14 }, (_, index) => index + 8);
const ENGAGEMENT_COLORS = ["#94A3B8", "#2196F3", "#22C55E"];

const numberFormatter = new Intl.NumberFormat();
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const formatNumber = (value: number): string => numberFormatter.format(Math.round(value));

const formatPct = (value: number): string => `${Math.round(value)}%`;

const formatDelta = (delta: number | null): string | null => {
  if (delta === null) {
    return null;
  }

  const rounded = Math.round(delta);
  return `${rounded >= 0 ? "↑" : "↓"} ${Math.abs(rounded)}%`;
};

const rangeNoun = (range: ReportRange): string => (range === "season" ? "season" : range);

const relativeGeneratedAt = (value: string): string => {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));

  if (seconds < 60) {
    return "Updated just now";
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `Updated ${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  return `Updated ${hours} hr ago`;
};

const hourLabel = (hour: number): string => {
  const suffix = hour >= 12 ? "p" : "a";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}${suffix}`;
};

const INSIGHT_ICONS = {
  peak: Clock,
  engagement: Users,
  revenue: Ticket,
  unused: Ticket,
  capacity: Gauge
} as const;

const REPORT_CARD_CLASS =
  "h-full rounded-2xl border border-brand-border/80 bg-white shadow-sm transition-shadow hover:shadow-md";
const REPORT_CARD_HEADER_CLASS = "space-y-1 p-5 pb-3 md:p-6 md:pb-4";
const REPORT_CARD_CONTENT_CLASS = "p-5 pt-0 md:p-6 md:pt-0";
const REPORT_SUBTITLE_CLASS = "text-sm leading-5 text-slate-500";

const escapeCsv = (value: string | number): string => {
  const raw = String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

const CSV_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const buildCsv = (headers: string[], rows: Array<Array<string | number>>): string =>
  [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");

const downloadCsv = (csv: string, filename: string): void => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

const todayStamp = (): string => new Date().toISOString().slice(0, 10);

const exportAttendanceCsv = (summary: ReportsSummary): void => {
  const csv = buildCsv(
    ["date", "weekday", "members", "guests", "total", "peak_members", "peak_pct"],
    summary.dailyVisits.map((day) => [
      day.date,
      CSV_WEEKDAYS[day.weekday] ?? String(day.weekday),
      day.members,
      day.guests,
      day.members + day.guests,
      day.peakMembers,
      day.peakPct
    ])
  );
  downloadCsv(csv, `wedgewood-attendance-${summary.range}-${todayStamp()}.csv`);
};

const exportNeverVisitedCsv = (summary: ReportsSummary): void => {
  const csv = buildCsv(
    ["name", "email", "phone", "tier", "member_since"],
    summary.engagement.neverVisited.map((household) => [
      household.householdName,
      household.email ?? "",
      household.phone ?? "",
      household.tier,
      household.memberSince?.slice(0, 10) ?? ""
    ])
  );
  downloadCsv(csv, `wedgewood-never-visited-${todayStamp()}.csv`);
};

const exportGuestPassesCsv = (summary: ReportsSummary): void => {
  const { revenueCents, passesSold } = summary.guestPasses;
  const csv = buildCsv(
    ["name", "email", "packs_bought", "guests_admitted", "revenue"],
    summary.guestPasses.buyers.map((buyer) => [
      buyer.householdName,
      buyer.email ?? "",
      buyer.packs,
      buyer.guestsAdmitted,
      passesSold > 0 ? ((buyer.passes * revenueCents) / passesSold / 100).toFixed(2) : "0.00"
    ])
  );
  downloadCsv(csv, `wedgewood-guest-passes-${todayStamp()}.csv`);
};

export const Reports = () => {
  const [range, setRange] = useState<ReportRange>("season");
  const [showGuests, setShowGuests] = useState(true);
  const [showNeverVisited, setShowNeverVisited] = useState(false);
  const [neverFilter, setNeverFilter] = useState("");
  const navigate = useNavigate();
  const engagementCardRef = useRef<HTMLDivElement>(null);

  const openNeverVisitedList = () => {
    setShowNeverVisited(true);
    engagementCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const query = useQuery({
    queryKey: ["reports", range],
    queryFn: () => getReportsSummary(range),
    staleTime: 5 * 60 * 1000
  });
  const summary = query.data;
  const chartData = useMemo(
    () =>
      summary?.dailyVisits.map((day) => ({
        ...day,
        total: day.members + day.guests
      })) ?? [],
    [summary]
  );
  const engagementData = useMemo(() => {
    if (!summary) {
      return [];
    }

    return [
      { name: "Never", value: summary.engagement.buckets.never },
      { name: "Casual", value: summary.engagement.buckets.casual },
      { name: "Regular", value: summary.engagement.buckets.regular }
    ];
  }, [summary]);
  const heatmapMax = useMemo(
    () => Math.max(1, ...(summary?.peakHeatmap.map((cell) => cell.count) ?? [0])),
    [summary]
  );
  const heatmapLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of summary?.peakHeatmap ?? []) {
      map.set(`${cell.weekday}:${cell.hour}`, cell.count);
    }
    return map;
  }, [summary]);
  const neverEmails = summary?.engagement.neverVisited
    .map((household) => household.email)
    .filter((email): email is string => Boolean(email)) ?? [];
  const filteredNeverVisited = useMemo(() => {
    const needle = neverFilter.trim().toLowerCase();
    const all = summary?.engagement.neverVisited ?? [];

    if (!needle) {
      return all;
    }

    return all.filter(
      (household) =>
        household.householdName.toLowerCase().includes(needle) ||
        (household.email ?? "").toLowerCase().includes(needle)
    );
  }, [summary, neverFilter]);

  const copyEmails = async () => {
    if (neverEmails.length === 0) {
      toast.info("No emails to copy");
      return;
    }

    await navigator.clipboard.writeText(neverEmails.join(", "));
    toast.success("Emails copied");
  };

  if (query.isLoading) {
    return <ReportsSkeleton />;
  }

  if (query.isError || !summary) {
    return (
      <main className="mx-auto max-w-6xl p-4 md:p-6">
        <Card className={REPORT_CARD_CLASS}>
          <CardContent className={cn(REPORT_CARD_CONTENT_CLASS, "flex flex-col items-center gap-4 py-16 text-center")}>
            <h1 className="text-2xl font-bold text-brand-navy">Reports could not load</h1>
            <p className="max-w-md text-sm text-slate-500">Try again in a moment. If this keeps happening, check the backend logs.</p>
            <Button onClick={() => query.refetch()} className="bg-brand-primary text-white hover:bg-brand-primary/90">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">{relativeGeneratedAt(summary.generatedAt)}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border border-brand-border bg-white p-1">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`h-10 rounded-md px-3 text-sm font-semibold transition-colors ${
                  range === option.value ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-brand-background"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {summary.insights.length > 0 && (
        <Card className={REPORT_CARD_CLASS}>
          <CardContent className="divide-y divide-brand-border/80 p-3">
            {summary.insights.map((insight) => {
              const Icon = INSIGHT_ICONS[insight.type];
              const isEngagement = insight.type === "engagement";
              const row = (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-background text-brand-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="flex-1 text-sm font-medium text-brand-navy">{insight.text}</span>
                  {isEngagement && (
                    <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-primary">
                      View list
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                </>
              );

              return isEngagement ? (
                <button
                  key={insight.text}
                  type="button"
                  onClick={openNeverVisitedList}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-brand-background/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                >
                  {row}
                </button>
              ) : (
                <div key={insight.text} className="flex min-h-11 items-center gap-3 px-3 py-2">
                  {row}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <section className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total visits"
          value={formatNumber(summary.kpis.totalVisits.value)}
          delta={summary.kpis.totalVisits.delta}
          showNewChip={range !== "season" && summary.kpis.totalVisits.delta === null && summary.kpis.totalVisits.value > 0}
        />
        <KpiCard
          label="Unique members"
          value={formatNumber(summary.kpis.uniqueMembers.value)}
          delta={summary.kpis.uniqueMembers.delta}
          showNewChip={range !== "season" && summary.kpis.uniqueMembers.delta === null && summary.kpis.uniqueMembers.value > 0}
        />
        <KpiCard
          label="Avg per open day"
          value={formatNumber(summary.kpis.avgPerOpenDay.value)}
          sublabel={`${summary.kpis.openDays} open days this ${rangeNoun(range)}`}
          delta={summary.kpis.avgPerOpenDay.delta}
          showNewChip={range !== "season" && summary.kpis.avgPerOpenDay.delta === null && summary.kpis.avgPerOpenDay.value > 0}
        />
        <KpiCard
          label="Busiest day"
          value={summary.kpis.busiestDay ? formatNumber(summary.kpis.busiestDay.count) : "—"}
          sublabel={summary.kpis.busiestDay?.date ?? "No visits yet"}
          delta={null}
        />
      </section>

      <Card className={REPORT_CARD_CLASS}>
        <CardHeader className={cn(REPORT_CARD_HEADER_CLASS, "flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between")}>
          <div>
            <CardTitle className="text-brand-navy">Attendance</CardTitle>
            <p className={REPORT_SUBTITLE_CLASS}>Daily member and guest visits.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={showGuests}
                onChange={(event) => setShowGuests(event.target.checked)}
                className="h-4 w-4 rounded border-brand-border text-brand-primary"
              />
              Guests
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => exportAttendanceCsv(summary)}
              className="h-10 border-brand-border bg-white text-brand-navy"
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className={REPORT_CARD_CONTENT_CLASS}>
          {chartData.some((day) => day.total > 0) ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: 0, right: 16, top: 10, bottom: 0 }}>
                  <CartesianGrid stroke="#EEEEEE" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickMargin={8} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="members" stroke="#2196F3" strokeWidth={3} dot={false} />
                  {showGuests && <Line type="monotone" dataKey="guests" stroke="#22C55E" strokeWidth={3} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState>No visits in this range yet.</EmptyState>
          )}
        </CardContent>
      </Card>

      <Card className={REPORT_CARD_CLASS}>
        <CardHeader className={REPORT_CARD_HEADER_CLASS}>
          <CardTitle className="text-brand-navy">Peak Hours</CardTitle>
          <p className={REPORT_SUBTITLE_CLASS}>Check-ins by New York weekday and hour.</p>
        </CardHeader>
        <CardContent className={REPORT_CARD_CONTENT_CLASS}>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[56px_repeat(14,minmax(42px,1fr))] gap-1 text-xs text-slate-500">
                <div />
                {HEATMAP_HOURS.map((hour) => (
                  <div key={hour} className="text-center font-semibold">
                    {hourLabel(hour)}
                  </div>
                ))}
                {WEEKDAYS.map((weekday) => (
                  <HeatmapRow key={weekday.value} weekday={weekday} lookup={heatmapLookup} max={heatmapMax} />
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid items-stretch gap-6 lg:grid-cols-2">
        <Card ref={engagementCardRef} className={cn(REPORT_CARD_CLASS, "scroll-mt-20")}>
          <CardHeader className={REPORT_CARD_HEADER_CLASS}>
            <CardTitle className="text-brand-navy">Engagement</CardTitle>
            <p className={REPORT_SUBTITLE_CLASS}>Household visits this season.</p>
          </CardHeader>
          <CardContent className={cn(REPORT_CARD_CONTENT_CLASS, "space-y-5")}>
            {engagementData.some((item) => item.value > 0) ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={engagementData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88}>
                        {engagementData.map((item, index) => (
                          <Cell key={item.name} fill={ENGAGEMENT_COLORS[index] ?? "#2196F3"} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <EmptyState>No engagement data yet.</EmptyState>
            )}
            <div className="rounded-xl border border-brand-border/80 bg-white">
              <button
                type="button"
                onClick={() =>
                  setShowNeverVisited((value) => {
                    if (value) {
                      setNeverFilter("");
                    }

                    return !value;
                  })
                }
                className="flex min-h-11 w-full items-center justify-between px-4 text-left text-sm font-semibold text-brand-navy"
              >
                Never visited ({summary.engagement.buckets.never})
                <span className="text-brand-primary">{showNeverVisited ? "Hide" : "Show"}</span>
              </button>
              {showNeverVisited && (
                <div className="border-t border-brand-border/80 p-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={copyEmails} className="h-11 border-brand-border">
                      <Copy className="h-4 w-4" />
                      Copy emails
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={summary.engagement.neverVisited.length === 0}
                      onClick={() => exportNeverVisitedCsv(summary)}
                      className="h-11 border-brand-border"
                    >
                      <Download className="h-4 w-4" />
                      CSV
                    </Button>
                  </div>
                  {summary.engagement.neverVisited.length === 0 ? (
                    <p className="text-sm text-slate-500">Every household has visited.</p>
                  ) : (
                    <>
                      <Input
                        placeholder="Search households…"
                        value={neverFilter}
                        onChange={(event) => setNeverFilter(event.target.value)}
                        className="mb-3 h-10"
                      />
                      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                        {filteredNeverVisited.length === 0 ? (
                          <p className="p-2 text-sm text-slate-500">No households match "{neverFilter}".</p>
                        ) : (
                          filteredNeverVisited.map((household) => (
                            <div
                              key={household.membershipId}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                household.primaryPersonId && navigate(`/members/${household.primaryPersonId}`)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && household.primaryPersonId) {
                                  navigate(`/members/${household.primaryPersonId}`);
                                }
                              }}
                              className="flex cursor-pointer items-center justify-between rounded-lg bg-brand-background/60 p-3 transition-colors hover:bg-brand-background focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                            >
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-brand-navy">{household.householdName}</div>
                                <div className="truncate text-sm text-slate-500">
                                  {household.tier} · {household.email ?? "No email"}
                                </div>
                              </div>
                              {household.email && (
                                <button
                                  type="button"
                                  aria-label={`Copy email for ${household.householdName}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void navigator.clipboard.writeText(household.email ?? "");
                                    toast.success("Email copied");
                                  }}
                                  className="ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-400 hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className={REPORT_CARD_CLASS}>
          <CardHeader className={cn(REPORT_CARD_HEADER_CLASS, "flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between")}>
            <div>
              <CardTitle className="text-brand-navy">Guest Passes</CardTitle>
              <p className={REPORT_SUBTITLE_CLASS}>Pack sales and guest admissions.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={summary.guestPasses.packsSold === 0}
              onClick={() => exportGuestPassesCsv(summary)}
              className="h-10 border-brand-border bg-white text-brand-navy"
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </CardHeader>
          <CardContent className={cn(REPORT_CARD_CONTENT_CLASS, "space-y-5")}>
            <div>
              <div
                className={cn(
                  "text-3xl font-bold tabular-nums text-brand-navy",
                  summary.guestPasses.revenueCents === 0 && "font-semibold text-slate-500"
                )}
              >
                {currencyFormatter.format(summary.guestPasses.revenueCents / 100)}
              </div>
              <p className="text-sm text-slate-500">Guest pass revenue</p>
            </div>
            {summary.guestPasses.packsSold === 0 ? (
              <div className="rounded-xl border border-dashed border-brand-border/80 bg-brand-background/40 p-5 text-sm leading-6 text-slate-500">
                <p className="font-medium">No packs sold this {rangeNoun(range)}.</p>
                {summary.guestPasses.guestsAdmitted > 0 && (
                  <p className="mt-2">
                    Members brought {summary.guestPasses.guestsAdmitted} guest
                    {summary.guestPasses.guestsAdmitted === 1 ? "" : "s"} using their passes.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div>
                  <div className="flex justify-between text-sm font-semibold text-brand-navy">
                    <span>{summary.guestPasses.guestsAdmitted} admitted</span>
                    <span>{summary.guestPasses.passesSold} sold</span>
                  </div>
                  <div className="mt-2 h-3 rounded-full bg-brand-background">
                    <div
                      className="h-3 rounded-full bg-brand-primary"
                      style={{
                        width: `${Math.min(100, (summary.guestPasses.guestsAdmitted / summary.guestPasses.passesSold) * 100)}%`
                      }}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Top buyers</h3>
                  <div className="mt-3 space-y-2">
                    {summary.guestPasses.topBuyers.map((buyer) => (
                      <div
                        key={buyer.householdName}
                        className="flex items-center justify-between rounded-xl bg-brand-background/60 p-3"
                      >
                        <span className="font-semibold text-brand-navy">{buyer.householdName}</span>
                        <span className="text-sm tabular-nums text-slate-500">
                          {buyer.packs} packs · {buyer.passes} passes
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid items-stretch gap-6 lg:grid-cols-2">
        <Card className={REPORT_CARD_CLASS}>
          <CardHeader className={REPORT_CARD_HEADER_CLASS}>
            <CardTitle className="text-brand-navy">Capacity</CardTitle>
            <p className={REPORT_SUBTITLE_CLASS}>Average daily peak, members only.</p>
          </CardHeader>
          <CardContent className={cn(REPORT_CARD_CONTENT_CLASS, "flex h-[calc(100%-88px)] flex-col justify-center space-y-5")}>
            <div className="rounded-xl bg-brand-background/40 p-5 text-center">
              <div
                className={cn(
                  "text-4xl font-bold tabular-nums text-brand-navy",
                  summary.capacity.avgDailyPeakPct === 0 && "font-semibold text-slate-500"
                )}
              >
                {formatPct(summary.capacity.avgDailyPeakPct)}
              </div>
              <p className="text-sm text-slate-500">Avg daily peak of {summary.capacity.maxCapacity} swimmer capacity</p>
            </div>
            <div className="h-3 rounded-full bg-brand-background">
              <div
                className="h-3 rounded-full bg-brand-primary"
                style={{ width: `${Math.min(100, summary.capacity.avgDailyPeakPct)}%` }}
              />
            </div>
            <div
              className={cn(
                "rounded-xl bg-brand-background/60 p-3 text-center text-sm font-semibold tabular-nums text-brand-navy",
                summary.capacity.daysOver80Pct === 0 && "font-medium text-slate-500"
              )}
            >
              {summary.capacity.daysOver80Pct} days over 80%
            </div>
          </CardContent>
        </Card>

        <Card className={REPORT_CARD_CLASS}>
          <CardHeader className={REPORT_CARD_HEADER_CLASS}>
            <CardTitle className="text-brand-navy">Staff Activity</CardTitle>
            <p className={REPORT_SUBTITLE_CLASS}>Manual actions and member edits.</p>
          </CardHeader>
          <CardContent className={REPORT_CARD_CONTENT_CLASS}>
            {summary.staffActivity.length === 0 ? (
              <EmptyState>No staff activity in this range.</EmptyState>
            ) : (
              <div className="-mx-2 overflow-x-auto px-2">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-semibold">Staff</th>
                      <th className="px-2 py-2 font-semibold">Manual check-ins</th>
                      <th className="px-2 py-2 font-semibold">Sign-outs</th>
                      <th className="px-2 py-2 font-semibold">Edits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.staffActivity.map((staff) => (
                      <tr key={staff.staffId} className="border-t border-brand-border/80">
                        <td className="px-2 py-3 font-semibold text-brand-navy">{staff.name}</td>
                        <td className="px-2 py-3 tabular-nums text-slate-600">{staff.manualCheckins}</td>
                        <td className="px-2 py-3 tabular-nums text-slate-600">{staff.manualSignouts}</td>
                        <td className="px-2 py-3 tabular-nums text-slate-600">{staff.edits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

const ReportsSkeleton = () => (
  <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-11 w-72" />
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
    <Skeleton className="h-80 w-full" />
    <div className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  </main>
);

const KpiCard = ({
  label,
  value,
  delta,
  sublabel,
  showNewChip = false
}: {
  label: string;
  value: string;
  delta: number | null;
  sublabel?: string;
  showNewChip?: boolean;
}) => {
  const formattedDelta = formatDelta(delta);

  return (
    <Card className={REPORT_CARD_CLASS}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <div className="mt-2 text-3xl font-bold tabular-nums text-brand-navy">{value}</div>
            {sublabel && <p className="mt-1 text-xs text-slate-500">{sublabel}</p>}
          </div>
          {formattedDelta && (
            <Badge className={delta !== null && delta < 0 ? "bg-brand-danger text-white" : "bg-brand-success text-white"}>
              {formattedDelta}
            </Badge>
          )}
          {!formattedDelta && showNewChip && <Badge className="bg-brand-background text-slate-600">new</Badge>}
        </div>
      </CardContent>
    </Card>
  );
};

const EmptyState = ({ children }: { children: string }) => (
  <div className="rounded-xl border border-dashed border-brand-border/80 bg-brand-background/40 p-8 text-center text-sm font-medium text-slate-500">
    {children}
  </div>
);

const HeatmapRow = ({
  weekday,
  lookup,
  max
}: {
  weekday: { value: number; label: string };
  lookup: Map<string, number>;
  max: number;
}) => (
  <>
    <div className="flex h-9 items-center font-semibold text-slate-600">{weekday.label}</div>
    {HEATMAP_HOURS.map((hour) => {
      const count = lookup.get(`${weekday.value}:${hour}`) ?? 0;
      const opacity = count === 0 ? 0.08 : 0.18 + (count / max) * 0.72;

      return (
        <div
          key={`${weekday.value}-${hour}`}
          title={`${weekday.label} ${hourLabel(hour)}: ${count} check-ins`}
          className="flex h-9 items-center justify-center rounded-md text-xs font-semibold text-brand-navy"
          style={{ backgroundColor: `rgba(33, 150, 243, ${opacity})` }}
        >
          {count > 0 ? count : ""}
        </div>
      );
    })}
  </>
);
