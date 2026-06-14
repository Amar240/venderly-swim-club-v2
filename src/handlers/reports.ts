import type { RequestHandler } from "express";
import { z } from "zod";
import { CENTS_PER_PASS, PASSES_PER_PACK } from "../lib/guestPasses";
import { prisma } from "../lib/prisma";
import {
  getDayBounds,
  getNewYorkDateTimeParts,
  getTimeZoneParts,
  localDateTimeToUtc,
  NEW_YORK_TIME_ZONE
} from "../lib/timezone";
import type { StaffResponse } from "../middleware/jwtAuth";

export const SEASON_START = "2026-05-01"; // First season; revisit for multi-year support.

const CACHE_TTL_MS = 5 * 60 * 1000;
const HEATMAP_START_HOUR = 8;
const HEATMAP_END_HOUR = 21;

const rangeSchema = z.object({
  range: z.enum(["today", "week", "month", "season"]).default("season")
});

export type ReportRange = z.infer<typeof rangeSchema>["range"];

type DailyVisit = {
  date: string;
  members: number;
  guests: number;
};

type EnrichedDailyVisit = DailyVisit & {
  weekday: number; // 0=Sun … 6=Sat, New York timezone
  peakMembers: number; // peak concurrent members that day
  peakPct: number; // peakMembers / maxCapacity * 100, 1 decimal
};

type CheckinRow = {
  id?: string;
  checkedInAt: Date;
  signedOutAt: Date | null;
  personId: string | null;
  membershipId: string | null;
  staffId?: string | null;
  numGuests: number;
  source?: string;
  staff?: { id: string; name: string } | null;
};

type MembershipRow = {
  id: string;
  tier: string;
  submittedAt: Date | null;
  persons: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
  }>;
};

type GuestPassPurchaseRow = {
  quantityPurchased: number;
  membershipId: string | null;
  membership: {
    persons: Array<{ firstName: string; lastName: string; email: string | null; isPrimary: boolean }>;
  } | null;
  person: { firstName: string; lastName: string } | null;
};

type EditLogRow = {
  createdAt: Date;
  staffId: string;
  staff: { id: string; name: string };
};

type ReportWindow = {
  range: ReportRange;
  start: Date;
  end: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
  dayKeys: string[];
};

type KpiMetric = {
  value: number;
  delta: number | null;
};

export type ReportInsight = {
  type: "peak" | "engagement" | "revenue" | "unused" | "capacity";
  text: string;
};

export type ReportsSummary = {
  range: ReportRange;
  startDate: string;
  endDate: string;
  generatedAt: string;
  kpis: {
    totalVisits: KpiMetric;
    uniqueMembers: KpiMetric;
    avgPerOpenDay: KpiMetric;
    openDays: number;
    busiestDay: { date: string; count: number } | null;
  };
  dailyVisits: EnrichedDailyVisit[];
  peakHeatmap: Array<{ weekday: number; hour: number; count: number }>;
  engagement: {
    buckets: { never: number; casual: number; regular: number };
    neverVisited: Array<{
      membershipId: string;
      primaryPersonId: string | null;
      householdName: string;
      email: string | null;
      phone: string | null;
      tier: string;
      memberSince: string | null;
    }>;
  };
  guestPasses: {
    revenueCents: number;
    packsSold: number;
    passesSold: number;
    guestsAdmitted: number;
    topBuyers: Array<{ householdName: string; packs: number; passes: number }>;
    buyers: Array<{
      householdName: string;
      email: string | null;
      packs: number;
      passes: number;
      guestsAdmitted: number;
    }>;
  };
  capacity: {
    maxCapacity: number;
    avgDailyPeakPct: number;
    daysOver80Pct: number;
    note: "peak concurrency";
  };
  staffActivity: Array<{
    staffId: string;
    name: string;
    manualCheckins: number;
    manualSignouts: number;
    edits: number;
  }>;
  insights: ReportInsight[];
};

type CacheEntry = {
  expiresAt: number;
  data: ReportsSummary;
};

const reportsCache = new Map<string, CacheEntry>();

export const clearReportsCache = (): void => {
  reportsCache.clear();
};

const pad = (value: number): string => String(value).padStart(2, "0");

const toDateKey = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;

const dateKeyToParts = (dateKey: string): { year: number; month: number; day: number } => {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-");
  return {
    year: Number.parseInt(yearRaw ?? "", 10),
    month: Number.parseInt(monthRaw ?? "", 10),
    day: Number.parseInt(dayRaw ?? "", 10)
  };
};

const addDaysToDateKey = (dateKey: string, days: number): string => {
  const { year, month, day } = dateKeyToParts(dateKey);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return toDateKey(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
};

const dateKeysBetween = (start: Date, end: Date): string[] => {
  const startKey = getNewYorkDateTimeParts(start).dateKey;
  const endKey = getNewYorkDateTimeParts(end).dateKey;
  const keys: string[] = [];
  let cursor = startKey;

  while (cursor <= endKey) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }

  return keys;
};

const dateKeyStart = (dateKey: string): Date => {
  const { year, month, day } = dateKeyToParts(dateKey);
  return localDateTimeToUtc(year, month, day, NEW_YORK_TIME_ZONE);
};

export const percentDelta = (current: number, previous: number, includeDelta: boolean): number | null => {
  if (!includeDelta) {
    return null;
  }

  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / previous) * 100;
};

export const getReportWindow = (range: ReportRange, now = new Date()): ReportWindow => {
  const nowParts = getTimeZoneParts(now, NEW_YORK_TIME_ZONE);
  const todayStart = localDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day, NEW_YORK_TIME_ZONE);
  let start: Date;

  if (range === "today") {
    start = todayStart;
  } else if (range === "week") {
    start = localDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day - 6, NEW_YORK_TIME_ZONE);
  } else if (range === "month") {
    start = localDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day - 29, NEW_YORK_TIME_ZONE);
  } else {
    start = getDayBounds(SEASON_START).start;
  }

  const durationMs = Math.max(1, now.getTime() - start.getTime());
  const includePrevious = range !== "season";

  return {
    range,
    start,
    end: now,
    previousStart: includePrevious ? new Date(start.getTime() - durationMs) : null,
    previousEnd: includePrevious ? start : null,
    dayKeys: dateKeysBetween(start, now)
  };
};

export const zeroFillDailyVisits = (dayKeys: string[], checkins: CheckinRow[]): DailyVisit[] => {
  const byDay = new Map(dayKeys.map((date) => [date, { date, members: 0, guests: 0 }]));

  for (const checkin of checkins) {
    const date = getNewYorkDateTimeParts(checkin.checkedInAt).dateKey;
    const bucket = byDay.get(date);

    if (!bucket) {
      continue;
    }

    bucket.members += 1;
    bucket.guests += checkin.numGuests;
  }

  return Array.from(byDay.values());
};

export const countOpenDays = (dailyVisits: DailyVisit[]): number =>
  dailyVisits.filter((day) => day.members + day.guests > 0).length;

const countOpenDaysFromCheckins = (checkins: CheckinRow[]): number => {
  const visitsByDay = new Map<string, number>();

  for (const checkin of checkins) {
    const dateKey = getNewYorkDateTimeParts(checkin.checkedInAt).dateKey;
    visitsByDay.set(dateKey, (visitsByDay.get(dateKey) ?? 0) + 1 + checkin.numGuests);
  }

  return Array.from(visitsByDay.values()).filter((visits) => visits > 0).length;
};

export const calculateKpiStats = (checkins: CheckinRow[], openDays: number) => {
  const totalVisits = checkins.reduce((total, checkin) => total + 1 + checkin.numGuests, 0);
  const uniqueMembers = new Set(checkins.map((checkin) => checkin.personId).filter((personId) => personId !== null))
    .size;

  return {
    totalVisits,
    uniqueMembers,
    avgPerOpenDay: totalVisits / Math.max(openDays, 1)
  };
};

const busiestDayFromDailyVisits = (dailyVisits: DailyVisit[]): { date: string; count: number } | null => {
  const busiest = dailyVisits.reduce<{ date: string; count: number } | null>((current, day) => {
    const count = day.members + day.guests;
    if (count === 0) {
      return current;
    }

    if (!current || count > current.count) {
      return { date: day.date, count };
    }

    return current;
  }, null);

  return busiest;
};

export const buildPeakHeatmap = (checkins: CheckinRow[]): Array<{ weekday: number; hour: number; count: number }> => {
  const buckets = new Map<string, number>();

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    for (let hour = HEATMAP_START_HOUR; hour <= HEATMAP_END_HOUR; hour += 1) {
      buckets.set(`${weekday}:${hour}`, 0);
    }
  }

  for (const checkin of checkins) {
    const parts = getNewYorkDateTimeParts(checkin.checkedInAt);

    if (parts.hour < HEATMAP_START_HOUR || parts.hour > HEATMAP_END_HOUR) {
      continue;
    }

    const key = `${parts.weekday}:${parts.hour}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return Array.from(buckets.entries()).map(([key, count]) => {
    const [weekday, hour] = key.split(":").map((value) => Number.parseInt(value, 10));
    return { weekday: weekday ?? 0, hour: hour ?? 0, count };
  });
};

const householdName = (persons: Array<{ firstName: string; lastName: string; isPrimary?: boolean }>): string => {
  const primary = persons.find((person) => person.isPrimary) ?? persons[0];
  return primary ? `${primary.firstName} ${primary.lastName}`.trim() : "Unknown household";
};

export const buildEngagement = (memberships: MembershipRow[], seasonCheckins: CheckinRow[]) => {
  const visitsByMembership = new Map<string, number>();

  for (const checkin of seasonCheckins) {
    if (!checkin.membershipId) {
      continue;
    }

    visitsByMembership.set(checkin.membershipId, (visitsByMembership.get(checkin.membershipId) ?? 0) + 1);
  }

  const neverVisited: ReportsSummary["engagement"]["neverVisited"] = [];
  const buckets = { never: 0, casual: 0, regular: 0 };

  for (const membership of memberships) {
    const visits = visitsByMembership.get(membership.id) ?? 0;
    const primary = membership.persons.find((person) => person.isPrimary) ?? membership.persons[0];

    if (visits === 0) {
      buckets.never += 1;
      neverVisited.push({
        membershipId: membership.id,
        primaryPersonId: primary?.id ?? null,
        householdName: householdName(membership.persons),
        email: primary?.email ?? null,
        phone: primary?.phone ?? null,
        tier: membership.tier,
        memberSince: membership.submittedAt?.toISOString() ?? null
      });
    } else if (visits <= 5) {
      buckets.casual += 1;
    } else {
      buckets.regular += 1;
    }
  }

  neverVisited.sort((first, second) => {
    const firstTime = first.memberSince ? Date.parse(first.memberSince) : Number.MAX_SAFE_INTEGER;
    const secondTime = second.memberSince ? Date.parse(second.memberSince) : Number.MAX_SAFE_INTEGER;
    return firstTime - secondTime;
  });

  return {
    buckets,
    neverVisited: neverVisited.slice(0, 50)
  };
};

export const buildGuestPasses = (
  purchases: GuestPassPurchaseRow[],
  currentCheckins: Array<Pick<CheckinRow, "numGuests" | "membershipId">> = []
): ReportsSummary["guestPasses"] => {
  const buyers = new Map<
    string,
    { householdName: string; email: string | null; packs: number; passes: number; guestsAdmitted: number }
  >();
  let packsSold = 0;

  const guestsByMembership = new Map<string, number>();

  for (const checkin of currentCheckins) {
    if (checkin.membershipId && checkin.numGuests > 0) {
      guestsByMembership.set(
        checkin.membershipId,
        (guestsByMembership.get(checkin.membershipId) ?? 0) + checkin.numGuests
      );
    }
  }

  for (const purchase of purchases) {
    packsSold += purchase.quantityPurchased;

    const name = purchase.membership
      ? householdName(purchase.membership.persons)
      : purchase.person
      ? `${purchase.person.firstName} ${purchase.person.lastName}`.trim()
      : "Unknown household";
    const primary =
      purchase.membership?.persons.find((person) => person.isPrimary) ?? purchase.membership?.persons[0];
    const key = purchase.membershipId ?? name;
    const buyer =
      buyers.get(key) ?? {
        householdName: name,
        email: primary?.email ?? null,
        packs: 0,
        passes: 0,
        guestsAdmitted: purchase.membershipId ? guestsByMembership.get(purchase.membershipId) ?? 0 : 0
      };
    buyer.packs += purchase.quantityPurchased;
    buyer.passes += purchase.quantityPurchased * PASSES_PER_PACK;
    buyers.set(key, buyer);
  }

  const passesSold = packsSold * PASSES_PER_PACK;
  const guestsAdmitted = currentCheckins.reduce((total, checkin) => total + checkin.numGuests, 0);
  const sortedBuyers = Array.from(buyers.values()).sort((first, second) => second.packs - first.packs);

  return {
    revenueCents: packsSold * PASSES_PER_PACK * CENTS_PER_PASS,
    packsSold,
    passesSold,
    guestsAdmitted,
    topBuyers: sortedBuyers.map(({ householdName: name, packs, passes }) => ({ householdName: name, packs, passes })).slice(0, 5),
    buyers: sortedBuyers
  };
};

export const buildCapacity = (
  checkins: Array<Pick<CheckinRow, "checkedInAt" | "signedOutAt">>,
  dayKeys: string[],
  maxCapacity: number
): { summary: ReportsSummary["capacity"]; dailyPeaks: Map<string, number> } => {
  const dailyPeakPcts: number[] = [];
  const dailyPeaks = new Map<string, number>();
  let daysOver80Pct = 0;

  for (const dateKey of dayKeys) {
    const dayStart = dateKeyStart(dateKey);
    const dayEnd = dateKeyStart(addDaysToDateKey(dateKey, 1));
    const events: Array<{ at: number; delta: number }> = [];

    for (const checkin of checkins) {
      const signout = checkin.signedOutAt ?? dayEnd;

      if (checkin.checkedInAt >= dayEnd || signout <= dayStart) {
        continue;
      }

      events.push({ at: Math.max(checkin.checkedInAt.getTime(), dayStart.getTime()), delta: 1 });
      // Forgotten sign-outs are auto-flipped at 11:59 PM, which can inflate late-evening occupancy;
      // acceptable v1 approximation for owner reporting.
      events.push({ at: Math.min(signout.getTime(), dayEnd.getTime()), delta: -1 });
    }

    events.sort((first, second) => first.at - second.at || first.delta - second.delta);

    let concurrent = 0;
    let peak = 0;

    for (const event of events) {
      concurrent += event.delta;
      peak = Math.max(peak, concurrent);
    }

    const pct = maxCapacity === 0 ? 0 : (peak / maxCapacity) * 100;
    dailyPeakPcts.push(pct);
    dailyPeaks.set(dateKey, peak);

    if (pct >= 80) {
      daysOver80Pct += 1;
    }
  }

  return {
    summary: {
      maxCapacity,
      avgDailyPeakPct:
        dailyPeakPcts.length === 0
          ? 0
          : dailyPeakPcts.reduce((total, pct) => total + pct, 0) / dailyPeakPcts.length,
      daysOver80Pct,
      note: "peak concurrency"
    },
    dailyPeaks
  };
};

export const buildStaffActivity = (
  manualCheckins: CheckinRow[],
  editLogs: EditLogRow[],
  start?: Date,
  end?: Date
): ReportsSummary["staffActivity"] => {
  const staff = new Map<string, { staffId: string; name: string; manualCheckins: number; manualSignouts: number; edits: number }>();

  const ensureStaff = (id: string, name: string) => {
    const existing = staff.get(id);
    if (existing) {
      return existing;
    }

    const next = { staffId: id, name, manualCheckins: 0, manualSignouts: 0, edits: 0 };
    staff.set(id, next);
    return next;
  };

  for (const checkin of manualCheckins) {
    if (!checkin.staffId || !checkin.staff) {
      continue;
    }

    const row = ensureStaff(checkin.staffId, checkin.staff.name);

    if (!start || !end || inRange(checkin.checkedInAt, start, end)) {
      row.manualCheckins += 1;
    }

    if (!start || !end ? Boolean(checkin.signedOutAt) : inRange(checkin.signedOutAt, start, end)) {
      row.manualSignouts += 1;
    }
  }

  for (const edit of editLogs) {
    const row = ensureStaff(edit.staffId, edit.staff.name);
    row.edits += 1;
  }

  return Array.from(staff.values()).sort(
    (first, second) =>
      second.manualCheckins +
      second.manualSignouts +
      second.edits -
      (first.manualCheckins + first.manualSignouts + first.edits)
  );
};

export const weekdayName = (weekday: number): string =>
  ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][weekday] ?? "Weekends";

export const hourLabel = (hour: number): string => {
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${suffix}`;
};

export const buildInsights = (parts: {
  peakHeatmap: Array<{ weekday: number; hour: number; count: number }>;
  engagement: ReportsSummary["engagement"];
  guestPasses: ReportsSummary["guestPasses"];
  capacity: ReportsSummary["capacity"];
  range: ReportRange;
}): ReportInsight[] => {
  const insights: ReportInsight[] = [];
  const busiest = parts.peakHeatmap.reduce<{ weekday: number; hour: number; count: number } | null>(
    (current, cell) => (!current || cell.count > current.count ? cell : current),
    null
  );

  if (busiest && busiest.count > 0) {
    insights.push({
      type: "peak",
      text: `${weekdayName(busiest.weekday)} around ${hourLabel(busiest.hour)} are your busiest hours. Consider extra staff then.`
    });
  }

  if (parts.engagement.buckets.never > 0) {
    insights.push({
      type: "engagement",
      text: `${parts.engagement.buckets.never} households haven't visited yet this season. A reminder email could bring them in.`
    });
  }

  if (parts.guestPasses.revenueCents > 0) {
    const dollars = Math.round(parts.guestPasses.revenueCents / 100).toLocaleString();
    insights.push({
      type: "revenue",
      text: `Guest passes brought in $${dollars} ${parts.range === "season" ? "this season" : `this ${parts.range}`}.`
    });
  }

  if (
    parts.guestPasses.passesSold > 0 &&
    parts.guestPasses.guestsAdmitted / parts.guestPasses.passesSold < 0.4
  ) {
    insights.push({ type: "unused", text: "Most purchased guest passes are still unused." });
  }

  if (parts.capacity.daysOver80Pct > 0) {
    insights.push({
      type: "capacity",
      text: `The pool hit 80%+ capacity on ${parts.capacity.daysOver80Pct} days.`
    });
  }

  return insights.slice(0, 4);
};

const inRange = (date: Date | null, start: Date, end: Date): boolean =>
  Boolean(date && date >= start && date < end);

const buildSummaryFromRows = (input: {
  rangeWindow: ReportWindow;
  currentCheckins: CheckinRow[];
  previousCheckins: CheckinRow[];
  seasonCheckins: CheckinRow[];
  capacityCheckins: CheckinRow[];
  memberships: MembershipRow[];
  purchases: GuestPassPurchaseRow[];
  maxCapacity: number;
  staffActivityRows: CheckinRow[];
  editLogs: EditLogRow[];
}): ReportsSummary => {
  const rawDailyVisits = zeroFillDailyVisits(input.rangeWindow.dayKeys, input.currentCheckins);
  const openDays = countOpenDays(rawDailyVisits);
  const previousOpenDays = countOpenDaysFromCheckins(input.previousCheckins);
  const currentStats = calculateKpiStats(input.currentCheckins, openDays);
  const previousStats = calculateKpiStats(input.previousCheckins, previousOpenDays);
  const includeDelta = input.rangeWindow.range !== "season";
  const peakHeatmap = buildPeakHeatmap(input.currentCheckins);
  const engagement = buildEngagement(input.memberships, input.seasonCheckins);
  const guestPasses = buildGuestPasses(input.purchases, input.currentCheckins);
  const { summary: capacity, dailyPeaks } = buildCapacity(
    input.capacityCheckins,
    input.rangeWindow.dayKeys,
    input.maxCapacity
  );
  const dailyVisits: EnrichedDailyVisit[] = rawDailyVisits.map((day) => {
    const peak = dailyPeaks.get(day.date) ?? 0;
    const pct = capacity.maxCapacity === 0 ? 0 : (peak / capacity.maxCapacity) * 100;

    return {
      ...day,
      weekday: getNewYorkDateTimeParts(dateKeyStart(day.date)).weekday,
      peakMembers: peak,
      peakPct: Math.round(pct * 10) / 10
    };
  });
  const staffActivity = buildStaffActivity(
    input.staffActivityRows.filter((checkin) => Boolean(checkin.staffId || checkin.staff)),
    input.editLogs,
    input.rangeWindow.start,
    input.rangeWindow.end
  );
  const insights = buildInsights({
    peakHeatmap,
    engagement,
    guestPasses,
    capacity,
    range: input.rangeWindow.range
  });

  return {
    range: input.rangeWindow.range,
    startDate: input.rangeWindow.start.toISOString(),
    endDate: input.rangeWindow.end.toISOString(),
    generatedAt: new Date().toISOString(),
    kpis: {
      totalVisits: {
        value: currentStats.totalVisits,
        delta: percentDelta(currentStats.totalVisits, previousStats.totalVisits, includeDelta)
      },
      uniqueMembers: {
        value: currentStats.uniqueMembers,
        delta: percentDelta(currentStats.uniqueMembers, previousStats.uniqueMembers, includeDelta)
      },
      avgPerOpenDay: {
        value: currentStats.avgPerOpenDay,
        delta: percentDelta(currentStats.avgPerOpenDay, previousStats.avgPerOpenDay, includeDelta)
      },
      openDays,
      busiestDay: busiestDayFromDailyVisits(dailyVisits)
    },
    dailyVisits,
    peakHeatmap,
    engagement,
    guestPasses,
    capacity,
    staffActivity,
    insights
  };
};

export const getReportsSummary: RequestHandler = async (req, res, next) => {
  try {
    const staffResponse = res as StaffResponse;
    const clubId = staffResponse.locals.staff.clubId;
    const { range } = rangeSchema.parse(req.query);
    const cacheKey = `${clubId}:${range}`;
    const cached = reportsCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    const rangeWindow = getReportWindow(range);
    const seasonStart = getDayBounds(SEASON_START).start;
    const overlapStart = rangeWindow.start;
    const [
      club,
      currentCheckins,
      previousCheckins,
      seasonCheckins,
      capacityCheckins,
      staffActivityRows,
      memberships,
      purchases,
      editLogs
    ] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        select: { maxCapacity: true }
      }),
      prisma.checkinEvent.findMany({
        where: {
          clubId,
          checkedInAt: {
            gte: rangeWindow.start,
            lt: rangeWindow.end
          }
        },
        select: {
          checkedInAt: true,
          signedOutAt: true,
          personId: true,
          membershipId: true,
          staffId: true,
          numGuests: true,
          source: true,
          staff: { select: { id: true, name: true } }
        }
      }),
      rangeWindow.previousStart && rangeWindow.previousEnd
        ? prisma.checkinEvent.findMany({
            where: {
              clubId,
              checkedInAt: {
                gte: rangeWindow.previousStart,
                lt: rangeWindow.previousEnd
              }
            },
            select: {
              checkedInAt: true,
              signedOutAt: true,
              personId: true,
              membershipId: true,
              numGuests: true
            }
          })
        : Promise.resolve([]),
      prisma.checkinEvent.findMany({
        where: {
          clubId,
          checkedInAt: {
            gte: seasonStart,
            lt: rangeWindow.end
          }
        },
        select: {
          checkedInAt: true,
          signedOutAt: true,
          personId: true,
          membershipId: true,
          numGuests: true
        }
      }),
      prisma.checkinEvent.findMany({
        where: {
          clubId,
          checkedInAt: { lt: rangeWindow.end },
          OR: [{ signedOutAt: null }, { signedOutAt: { gte: overlapStart } }]
        },
        select: {
          checkedInAt: true,
          signedOutAt: true,
          personId: true,
          membershipId: true,
          numGuests: true
        }
      }),
      prisma.checkinEvent.findMany({
        where: {
          clubId,
          staffId: { not: null },
          OR: [
            {
              checkedInAt: {
                gte: rangeWindow.start,
                lt: rangeWindow.end
              }
            },
            {
              signedOutAt: {
                gte: rangeWindow.start,
                lt: rangeWindow.end
              }
            }
          ]
        },
        select: {
          checkedInAt: true,
          signedOutAt: true,
          personId: true,
          membershipId: true,
          staffId: true,
          numGuests: true,
          staff: { select: { id: true, name: true } }
        }
      }),
      prisma.membership.findMany({
        where: {
          clubId,
          status: "ACTIVE"
        },
        select: {
          id: true,
          tier: true,
          submittedAt: true,
          persons: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              isPrimary: true
            }
          }
        }
      }),
      prisma.guestPassPurchase.findMany({
        where: {
          clubId,
          purchasedAt: {
            gte: rangeWindow.start,
            lt: rangeWindow.end
          }
        },
        select: {
          quantityPurchased: true,
          membershipId: true,
          membership: {
            select: {
              persons: {
                orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                  isPrimary: true
                }
              }
            }
          },
          person: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      }),
      prisma.memberEditLog.findMany({
        where: {
          clubId,
          createdAt: {
            gte: rangeWindow.start,
            lt: rangeWindow.end
          }
        },
        select: {
          createdAt: true,
          staffId: true,
          staff: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
    ]);

    const summary = buildSummaryFromRows({
      rangeWindow,
      currentCheckins,
      previousCheckins,
      seasonCheckins,
      capacityCheckins,
      memberships,
      purchases,
      maxCapacity: club?.maxCapacity ?? 0,
      staffActivityRows,
      editLogs
    });

    reportsCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: summary
    });

    res.json(summary);
  } catch (error) {
    next(error);
  }
};
