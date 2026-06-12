import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEW_YORK_TIME_ZONE, getDayBounds, getNewYorkTodayBounds, getTimeZoneParts } from "../../src/lib/timezone";

describe("getNewYorkTodayBounds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ordered bounds spanning exactly 24 hours during EDT", () => {
    vi.setSystemTime(new Date("2026-07-01T16:00:00Z"));

    const { start, end } = getNewYorkTodayBounds();

    expect(start.getTime()).toBeLessThan(end.getTime());
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(getTimeZoneParts(start, NEW_YORK_TIME_ZONE)).toMatchObject({
      year: 2026,
      month: 7,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0
    });
  });

  it("returns NY midnight bounds during EST", () => {
    vi.setSystemTime(new Date("2026-01-01T16:00:00Z"));

    const { start, end } = getNewYorkTodayBounds();

    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(getTimeZoneParts(start, NEW_YORK_TIME_ZONE)).toMatchObject({
      year: 2026,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0
    });
  });

  it("does not drift at New York midnight", () => {
    vi.setSystemTime(new Date("2026-07-01T04:00:00Z"));

    const { start } = getNewYorkTodayBounds();

    expect(start.toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(getTimeZoneParts(start, NEW_YORK_TIME_ZONE)).toMatchObject({ hour: 0, minute: 0, second: 0 });
  });
});

describe("getDayBounds", () => {
  it("returns New York bounds for an explicit date", () => {
    const { start, end } = getDayBounds("2026-06-03");

    expect(start.toISOString()).toBe("2026-06-03T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-04T04:00:00.000Z");
  });
});
