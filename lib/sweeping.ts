import { isSfParkingHolidayParts } from './holidays';

export const SF_TIMEZONE = 'America/Los_Angeles';
const HOUR_MS = 60 * 60 * 1000;

export interface StreetSegment {
  id: string;
  cnn: string;
  corridor: string;
  limits: string;
  side: string;
  sideLR: string;
  weekday: string;
  fromHour: number;
  toHour: number;
  fullname: string;
  week1: boolean;
  week2: boolean;
  week3: boolean;
  week4: boolean;
  week5: boolean;
  holidays: boolean;
  coordinates: [number, number][];
}

export interface NextSweepingResult {
  startTime: Date;
  endTime: Date;
  alertTime: Date;
  alertLeadHours: 24 | 12 | 0;
  skipAlert: boolean;
  formattedSchedule: string;
  formattedNextSweeping: string;
  formattedAlertTime: string;
  hoursUntilSweeping: number;
  isSweepingNow: boolean;
}

export interface SessionTimingInput {
  fromHour: number;
  toHour: number;
  sweepingStart: string;
  sweepingEnd: string;
  alertTime: string;
  parkedAt: string;
}

export interface ResolvedSessionTiming {
  sweepingStart: Date;
  sweepingEnd: Date;
  alertTime: Date;
  noticeHours: 24 | 12;
  skipAlert: boolean;
  formattedNextSweeping: string;
  formattedAlertTime: string;
  hoursUntilSweeping: number;
  isSweepingNow: boolean;
}

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Monday: 1,
  Tue: 2,
  Tues: 2,
  Tuesday: 2,
  Wed: 3,
  Wednesday: 3,
  Thu: 4,
  Thursday: 4,
  Fri: 5,
  Friday: 5,
  Sat: 6,
  Saturday: 6,
  Sun: 0,
  Sunday: 0,
};

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

export function formatTimeRange(fromHour: number, toHour: number): string {
  return `${formatHour(fromHour)} - ${formatHour(toHour)}`;
}

export interface SfDateParts {
  year: number;
  month0: number; // 0-11
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
}

export function getSfDateParts(date: Date): SfDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SF_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = Number(p.value);
    }
  }

  return {
    year: map.year,
    month0: map.month - 1,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

function getSfOffsetMs(ms: number): number {
  const sf = getSfDateParts(new Date(ms));
  const sfAsUtc = Date.UTC(sf.year, sf.month0, sf.day, sf.hour, sf.minute, sf.second);
  const roundedMs = Math.floor(ms / 1000) * 1000;
  return sfAsUtc - roundedMs;
}

/**
 * Converts a San Francisco wall-clock date & hour into an exact UTC Date instant,
 * handling both PST (-08:00) and PDT (-07:00) transitions accurately.
 */
export function sfWallTimeToDate(
  year: number,
  month0: number,
  day: number,
  hour: number,
  minute: number = 0
): Date {
  const utcGuess = Date.UTC(year, month0, day, hour, minute, 0, 0);
  const firstPass = utcGuess - getSfOffsetMs(utcGuess);
  return new Date(utcGuess - getSfOffsetMs(firstPass));
}

export function formatSfShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: SF_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatSfAlertDateTime(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: SF_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Computes the alert timestamp for a sweeping start relative to referenceTime (when parked):
 * - > 24h away: 24-hour advance warning
 * - 12h to 24h away: 12-hour advance backup warning (avoids double-texting right after parking)
 * - <= 12h away: skip separate alert (the "Car Parked" confirmation already shows the time)
 */
export function computeAlertWindow(
  startTime: Date,
  referenceTime: Date
): { alertTime: Date; alertLeadHours: 24 | 12 | 0; skipAlert: boolean } {
  const msUntilStart = startTime.getTime() - referenceTime.getTime();

  if (msUntilStart > 24 * HOUR_MS) {
    return {
      alertTime: new Date(startTime.getTime() - 24 * HOUR_MS),
      alertLeadHours: 24,
      skipAlert: false,
    };
  }

  if (msUntilStart > 12 * HOUR_MS) {
    return {
      alertTime: new Date(startTime.getTime() - 12 * HOUR_MS),
      alertLeadHours: 12,
      skipAlert: false,
    };
  }

  return {
    alertTime: new Date(startTime.getTime()),
    alertLeadHours: 0,
    skipAlert: true,
  };
}

/**
 * Calculates the next sweeping window and 24-hour (or 12-hour backup) advance alert
 * timestamp for a street segment in San Francisco time (America/Los_Angeles).
 */
export function calculateNextSweeping(
  segment: StreetSegment,
  now: Date = new Date()
): NextSweepingResult | null {
  const targetDayOfWeek = WEEKDAY_MAP[segment.weekday];
  if (targetDayOfWeek === undefined) {
    return null;
  }

  const sfToday = getSfDateParts(now);

  // Look ahead up to 60 calendar days in San Francisco local time
  for (let offset = 0; offset < 60; offset++) {
    // Anchor at 12:00 UTC so calendar year/month/day/weekday arithmetic is DST-safe
    const cal = new Date(Date.UTC(sfToday.year, sfToday.month0, sfToday.day + offset, 12, 0, 0));
    const year = cal.getUTCFullYear();
    const month0 = cal.getUTCMonth();
    const dayOfMonth = cal.getUTCDate();
    const dayOfWeek = cal.getUTCDay();

    if (dayOfWeek !== targetDayOfWeek) {
      continue;
    }

    const weekOfMonth = Math.floor((dayOfMonth - 1) / 7) + 1; // 1, 2, 3, 4, or 5

    let activeInWeek = false;
    if (weekOfMonth === 1 && segment.week1) activeInWeek = true;
    if (weekOfMonth === 2 && segment.week2) activeInWeek = true;
    if (weekOfMonth === 3 && segment.week3) activeInWeek = true;
    if (weekOfMonth === 4 && segment.week4) activeInWeek = true;
    if (weekOfMonth === 5 && segment.week5) activeInWeek = true;

    if (!activeInWeek) {
      continue;
    }

    // Check holiday exemption using San Francisco calendar date
    if (!segment.holidays && isSfParkingHolidayParts(month0, dayOfMonth, dayOfWeek)) {
      continue;
    }

    const startTime = sfWallTimeToDate(year, month0, dayOfMonth, segment.fromHour, 0);
    const endTime = sfWallTimeToDate(year, month0, dayOfMonth, segment.toHour, 0);

    // If today's sweeping window has already ended, skip to next occurrence
    if (endTime.getTime() <= now.getTime()) {
      continue;
    }

    const { alertTime, alertLeadHours, skipAlert } = computeAlertWindow(startTime, now);

    const hoursUntil = Math.max(
      0,
      Math.round((startTime.getTime() - now.getTime()) / HOUR_MS)
    );
    const isSweepingNow =
      now.getTime() >= startTime.getTime() && now.getTime() <= endTime.getTime();

    const formattedDate = formatSfShortDate(startTime);
    const timeRangeStr = formatTimeRange(segment.fromHour, segment.toHour);
    const alertFormatted = skipAlert
      ? 'Within 12h (no extra alert)'
      : formatSfAlertDateTime(alertTime);

    return {
      startTime,
      endTime,
      alertTime,
      alertLeadHours,
      skipAlert,
      formattedSchedule: `${segment.fullname}, ${timeRangeStr}`,
      formattedNextSweeping: `${formattedDate} (${timeRangeStr})`,
      formattedAlertTime: alertFormatted,
      hoursUntilSweeping: hoursUntil,
      isSweepingNow,
    };
  }

  return null;
}

/**
 * Resolves exact San Francisco timing for an active parking session, including
 * transparent self-healing for any session saved before the server UTC timezone fix.
 */
export function resolveSessionTiming(
  session: SessionTimingInput,
  now: Date = new Date()
): ResolvedSessionTiming {
  const rawStart = new Date(session.sweepingStart);
  const rawEnd = new Date(session.sweepingEnd);
  const rawAlert = new Date(session.alertTime);
  const parkedAt = session.parkedAt ? new Date(session.parkedAt) : now;

  let sweepingStart = rawStart;
  let sweepingEnd = rawEnd;
  let alertTime = rawAlert;
  let noticeHours: 24 | 12 = 24;
  let skipAlert = false;

  const sfStartParts = getSfDateParts(rawStart);
  const isLegacyUtcSession =
    sfStartParts.hour !== session.fromHour && rawStart.getUTCHours() === session.fromHour;

  if (isLegacyUtcSession) {
    // Reconstruct intended SF wall-clock sweeping window from the UTC calendar date
    const y = rawStart.getUTCFullYear();
    const m0 = rawStart.getUTCMonth();
    const d = rawStart.getUTCDate();
    sweepingStart = sfWallTimeToDate(y, m0, d, session.fromHour, 0);
    sweepingEnd = sfWallTimeToDate(y, m0, d, session.toHour, 0);

    const computed = computeAlertWindow(sweepingStart, parkedAt);
    alertTime = computed.alertTime;
    noticeHours = computed.alertLeadHours === 12 ? 12 : 24;
    skipAlert = computed.skipAlert;
  } else {
    const leadMs = sweepingStart.getTime() - alertTime.getTime();
    if (leadMs <= 60 * 1000) {
      skipAlert = true;
      noticeHours = 24;
    } else {
      noticeHours = leadMs >= 18 * HOUR_MS ? 24 : 12;
    }
  }

  const hoursUntil = Math.max(
    0,
    Math.round((sweepingStart.getTime() - now.getTime()) / HOUR_MS)
  );
  const isSweepingNow =
    now.getTime() >= sweepingStart.getTime() && now.getTime() <= sweepingEnd.getTime();

  const formattedNextSweeping = `${formatSfShortDate(sweepingStart)} (${formatTimeRange(
    session.fromHour,
    session.toHour
  )})`;
  const formattedAlertTime = skipAlert
    ? 'Within 12h (no extra alert)'
    : formatSfAlertDateTime(alertTime);

  return {
    sweepingStart,
    sweepingEnd,
    alertTime,
    noticeHours,
    skipAlert,
    formattedNextSweeping,
    formattedAlertTime,
    hoursUntilSweeping: hoursUntil,
    isSweepingNow,
  };
}
