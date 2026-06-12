import { describe, expect, it } from "vitest";
import {
  buildCapacity,
  buildEngagement,
  buildGuestPasses,
  buildInsights,
  buildPeakHeatmap,
  calculateKpiStats,
  countOpenDays,
  getReportWindow,
  percentDelta,
  zeroFillDailyVisits
} from "../../src/handlers/reports";
import { getNewYorkDateTimeParts } from "../../src/lib/timezone";

describe("getNewYorkDateTimeParts", () => {
  it("assigns UTC dates crossing midnight to the correct New York day", () => {
    expect(getNewYorkDateTimeParts(new Date("2026-06-02T03:30:00Z"))).toMatchObject({
      dateKey: "2026-06-01",
      hour: 23,
      weekday: 1
    });
  });
});

describe("getReportWindow", () => {
  it("builds a seven-day week window ending now", () => {
    const window = getReportWindow("week", new Date("2026-06-12T16:00:00Z"));

    expect(window.dayKeys).toHaveLength(7);
    expect(window.dayKeys[0]).toBe("2026-06-06");
    expect(window.dayKeys[6]).toBe("2026-06-12");
    expect(window.previousStart).toBeInstanceOf(Date);
    expect(window.previousEnd).toEqual(window.start);
  });
});

describe("zeroFillDailyVisits", () => {
  it("fills every requested day and buckets members and guests in New York time", () => {
    expect(
      zeroFillDailyVisits(["2026-06-01", "2026-06-02"], [
        {
          checkedInAt: new Date("2026-06-02T03:30:00Z"),
          signedOutAt: null,
          personId: "person_1",
          membershipId: "membership_1",
          numGuests: 2
        }
      ])
    ).toEqual([
      { date: "2026-06-01", members: 1, guests: 2 },
      { date: "2026-06-02", members: 0, guests: 0 }
    ]);
  });
});

describe("percentDelta", () => {
  it("returns null when a non-zero value has an empty previous window", () => {
    expect(percentDelta(10, 0, true)).toBeNull();
  });

  it("keeps zero to zero as a neutral delta", () => {
    expect(percentDelta(0, 0, true)).toBe(0);
  });

  it("returns null when deltas are disabled", () => {
    expect(percentDelta(10, 5, false)).toBeNull();
  });
});

describe("calculateKpiStats", () => {
  it("averages attendance over open days only", () => {
    const dailyVisits = [
      { date: "2026-06-01", members: 2, guests: 2 },
      { date: "2026-06-02", members: 0, guests: 0 }
    ];

    expect(countOpenDays(dailyVisits)).toBe(1);
    expect(
      calculateKpiStats(
        [
          {
            checkedInAt: new Date("2026-06-01T14:00:00Z"),
            signedOutAt: null,
            personId: "person_1",
            membershipId: "membership_1",
            numGuests: 2
          },
          {
            checkedInAt: new Date("2026-06-01T15:00:00Z"),
            signedOutAt: null,
            personId: "person_2",
            membershipId: "membership_1",
            numGuests: 0
          }
        ],
        countOpenDays(dailyVisits)
      )
    ).toMatchObject({ totalVisits: 4, avgPerOpenDay: 4 });
  });
});

describe("buildEngagement", () => {
  it("buckets households by season visit count", () => {
    const engagement = buildEngagement(
      [
        {
          id: "never",
          tier: "Family4",
          submittedAt: new Date("2026-05-01T12:00:00Z"),
          persons: [
            { id: "p1", firstName: "Never", lastName: "Visited", email: "never@example.com", phone: "3025550001", isPrimary: true }
          ]
        },
        {
          id: "casual",
          tier: "Family4",
          submittedAt: null,
          persons: [{ id: "p2", firstName: "Casual", lastName: "House", email: null, phone: null, isPrimary: true }]
        },
        {
          id: "regular",
          tier: "Family5",
          submittedAt: null,
          persons: [{ id: "p3", firstName: "Regular", lastName: "House", email: null, phone: null, isPrimary: true }]
        }
      ],
      [
        ...Array.from({ length: 3 }, (_, index) => ({
          checkedInAt: new Date(`2026-06-0${index + 1}T14:00:00Z`),
          signedOutAt: null,
          personId: `casual_${index}`,
          membershipId: "casual",
          numGuests: 0
        })),
        ...Array.from({ length: 6 }, (_, index) => ({
          checkedInAt: new Date(`2026-06-${String(index + 1).padStart(2, "0")}T14:00:00Z`),
          signedOutAt: null,
          personId: `regular_${index}`,
          membershipId: "regular",
          numGuests: 0
        }))
      ]
    );

    expect(engagement.buckets).toEqual({ never: 1, casual: 1, regular: 1 });
    expect(engagement.neverVisited).toEqual([
      expect.objectContaining({
        membershipId: "never",
        householdName: "Never Visited",
        primaryPersonId: "p1",
        phone: "3025550001"
      })
    ]);
  });
});

describe("buildGuestPasses", () => {
  it("derives revenue and passes from purchased packs", () => {
    expect(
      buildGuestPasses([
        {
          quantityPurchased: 3,
          membershipId: "membership_1",
          membership: {
            persons: [{ firstName: "Kelly", lastName: "Oldis", email: "kelly@example.com", isPrimary: true }]
          },
          person: null
        }
      ],
      [
        {
          checkedInAt: new Date("2026-06-01T14:00:00Z"),
          signedOutAt: null,
          personId: "person_1",
          membershipId: "membership_1",
          numGuests: 4
        }
      ])
    ).toEqual({
      revenueCents: 15000,
      packsSold: 3,
      passesSold: 30,
      guestsAdmitted: 4,
      topBuyers: [{ householdName: "Kelly Oldis", packs: 3, passes: 30 }],
      buyers: [
        {
          householdName: "Kelly Oldis",
          email: "kelly@example.com",
          packs: 3,
          passes: 30,
          guestsAdmitted: 4
        }
      ]
    });
  });
});

describe("buildCapacity", () => {
  it("sweeps overlapping check-ins to find daily peak concurrency", () => {
    const { summary: capacity, dailyPeaks } = buildCapacity(
      [
        {
          checkedInAt: new Date("2026-06-01T14:00:00Z"),
          signedOutAt: new Date("2026-06-01T16:00:00Z")
        },
        {
          checkedInAt: new Date("2026-06-01T15:00:00Z"),
          signedOutAt: new Date("2026-06-01T17:00:00Z")
        }
      ],
      ["2026-06-01"],
      10
    );

    expect(capacity.avgDailyPeakPct).toBe(20);
    expect(capacity.daysOver80Pct).toBe(0);
    expect(dailyPeaks.get("2026-06-01")).toBe(2);
  });
});

describe("buildPeakHeatmap", () => {
  it("counts only configured daytime New York hours", () => {
    const heatmap = buildPeakHeatmap([
      {
        checkedInAt: new Date("2026-06-01T17:00:00Z"),
        signedOutAt: null,
        personId: "person_1",
        membershipId: "membership_1",
        numGuests: 0
      }
    ]);

    expect(heatmap.find((cell) => cell.weekday === 1 && cell.hour === 13)?.count).toBe(1);
  });
});

describe("buildInsights", () => {
  it("returns typed rule-based insights when supporting data exists", () => {
    const insights = buildInsights({
      range: "month",
      peakHeatmap: [{ weekday: 6, hour: 13, count: 10 }],
      engagement: { buckets: { never: 23, casual: 2, regular: 1 }, neverVisited: [] },
      guestPasses: {
        revenueCents: 45000,
        packsSold: 9,
        passesSold: 90,
        guestsAdmitted: 20,
        topBuyers: [],
        buyers: []
      },
      capacity: { maxCapacity: 80, avgDailyPeakPct: 40, daysOver80Pct: 4, note: "peak concurrency" }
    });

    expect(insights).toContainEqual({
      type: "peak",
      text: "Saturdays around 1 PM are your busiest hours. Consider extra staff then."
    });
    expect(insights).toContainEqual({
      type: "engagement",
      text: "23 households haven't visited yet this season. A reminder email could bring them in."
    });
    expect(insights).toContainEqual({ type: "revenue", text: "Guest passes brought in $450 this month." });
    expect(insights).toContainEqual({
      type: "unused",
      text: "Most purchased guest passes are still unused."
    });
    expect(insights).toHaveLength(4);
  });

  it("returns no insights when data is empty", () => {
    expect(
      buildInsights({
        range: "season",
        peakHeatmap: [],
        engagement: { buckets: { never: 0, casual: 0, regular: 0 }, neverVisited: [] },
        guestPasses: {
          revenueCents: 0,
          packsSold: 0,
          passesSold: 0,
          guestsAdmitted: 0,
          topBuyers: [],
          buyers: []
        },
        capacity: { maxCapacity: 80, avgDailyPeakPct: 0, daysOver80Pct: 0, note: "peak concurrency" }
      })
    ).toEqual([]);
  });
});
