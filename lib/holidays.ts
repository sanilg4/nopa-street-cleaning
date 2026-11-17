/**
 * SFMTA Parking Holiday Calendar
 * On legal holidays, street cleaning is NOT enforced for standard residential daytime sweeping
 * (segments where holidays = false).
 */

export function isSfParkingHolidayParts(
  month: number, // 0-indexed (0 = Jan, 11 = Dec)
  day: number,
  dayOfWeek: number // 0 = Sun, 1 = Mon, ..., 6 = Sat
): boolean {
  // 1. Fixed-date holidays
  // New Year's Day (Jan 1)
  if (month === 0 && day === 1) return true;
  // Juneteenth (June 19)
  if (month === 5 && day === 19) return true;
  // Independence Day (July 4)
  if (month === 6 && day === 4) return true;
  // Veterans Day (Nov 11)
  if (month === 10 && day === 11) return true;
  // Christmas Day (Dec 25)
  if (month === 11 && day === 25) return true;

  // Helper for Nth weekday of month
  const nthWeekdayOfMonth = Math.floor((day - 1) / 7) + 1;

  // 2. Variable-date holidays (Mondays / Thursdays)
  // Martin Luther King Jr. Day: 3rd Monday in January
  if (month === 0 && dayOfWeek === 1 && nthWeekdayOfMonth === 3) return true;

  // Presidents' Day: 3rd Monday in February
  if (month === 1 && dayOfWeek === 1 && nthWeekdayOfMonth === 3) return true;

  // Memorial Day: Last Monday in May
  if (month === 4 && dayOfWeek === 1) {
    const nextWeekSameDay = day + 7;
    const daysInMay = 31;
    if (nextWeekSameDay > daysInMay) return true;
  }

  // Labor Day: 1st Monday in September
  if (month === 8 && dayOfWeek === 1 && nthWeekdayOfMonth === 1) return true;

  // Indigenous Peoples' Day: 2nd Monday in October
  if (month === 9 && dayOfWeek === 1 && nthWeekdayOfMonth === 2) return true;

  // Thanksgiving Day: 4th Thursday in November
  if (month === 10 && dayOfWeek === 4 && nthWeekdayOfMonth === 4) return true;

  return false;
}

export function isSfParkingHoliday(date: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(date);

  let month0 = 0;
  let day = 1;
  let weekdayStr = 'Sun';
  for (const p of parts) {
    if (p.type === 'month') month0 = Number(p.value) - 1;
    if (p.type === 'day') day = Number(p.value);
    if (p.type === 'weekday') weekdayStr = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[weekdayStr] ?? date.getDay();
  return isSfParkingHolidayParts(month0, day, dayOfWeek);
}
