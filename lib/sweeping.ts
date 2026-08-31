import { isSfParkingHoliday } from './holidays';

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
  formattedSchedule: string;
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
  return `${formatHour(fromHour)} – ${formatHour(toHour)}`;
}

/**
 * Calculates the next sweeping window and 12-hour advance alert timestamp for a segment.
 */
export function calculateNextSweeping(
  segment: StreetSegment,
  now: Date = new Date()
): NextSweepingResult | null {
  const targetDayOfWeek = WEEKDAY_MAP[segment.weekday];
  if (targetDayOfWeek === undefined) {
    return null;
  }

  // Look ahead up to 60 days to find the next matching sweeping date
  for (let offset = 0; offset < 60; offset++) {
    const candidate = new Date(now.getTime());
    candidate.setDate(candidate.getDate() + offset);

    if (candidate.getDay() !== targetDayOfWeek) {
      continue;
    }

    const dayOfMonth = candidate.getDate();
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

    // Check holiday exemption
    if (!segment.holidays && isSfParkingHoliday(candidate)) {
      continue;
    }

    const startTime = new Date(candidate);
    startTime.setHours(segment.fromHour, 0, 0, 0);

    const endTime = new Date(candidate);
    endTime.setHours(segment.toHour, 0, 0, 0);

    // If today's sweeping window has already ended, skip to next occurrence
    if (endTime.getTime() <= now.getTime()) {
      continue;
    }

    const alertTime = new Date(startTime.getTime() - 12 * 60 * 60 * 1000);
    const hoursUntil = Math.max(
      0,
      Math.round((startTime.getTime() - now.getTime()) / (1000 * 60 * 60))
    );
    const isSweepingNow =
      now.getTime() >= startTime.getTime() && now.getTime() <= endTime.getTime();

    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    };

    const formattedDate = startTime.toLocaleDateString('en-US', dateOptions);
    const timeRangeStr = formatTimeRange(segment.fromHour, segment.toHour);
    const alertFormatted = alertTime.toLocaleDateString('en-US', {
      ...dateOptions,
      hour: 'numeric',
      minute: '2-digit',
    });

    return {
      startTime,
      endTime,
      alertTime,
      formattedSchedule: `${segment.fullname}, ${timeRangeStr}`,
      formattedNextSweeping: `${formattedDate} (${timeRangeStr})`,
      formattedAlertTime: alertFormatted,
      hoursUntilSweeping: hoursUntil,
      isSweepingNow,
    };
  }

  return null;
}
