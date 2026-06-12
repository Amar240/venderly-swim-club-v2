export const NEW_YORK_TIME_ZONE = "America/New_York";

export const getTimeZoneParts = (
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const getPart = (type: string): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return value ? Number.parseInt(value, 10) : 0;
  };

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second")
  };
};

export const getTimeZoneOffsetMs = (date: Date, timeZone: string): number => {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
};

export const localDateTimeToUtc = (year: number, month: number, day: number, timeZone: string): Date => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
};

export const getNewYorkTodayBounds = (): { start: Date; end: Date } => {
  const nowParts = getTimeZoneParts(new Date(), NEW_YORK_TIME_ZONE);

  return {
    start: localDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day, NEW_YORK_TIME_ZONE),
    end: localDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day + 1, NEW_YORK_TIME_ZONE)
  };
};

export const getDayBounds = (
  date: string,
  timeZone = NEW_YORK_TIME_ZONE
): { start: Date; end: Date } => {
  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);

  return {
    start: localDateTimeToUtc(year, month, day, timeZone),
    end: localDateTimeToUtc(year, month, day + 1, timeZone)
  };
};
