import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/db';
import { formatTimeRange } from '@/lib/sweeping';

export async function GET() {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ isParked: false, session: null });
    }

    const now = new Date();
    const sweepingStart = new Date(session.sweepingStart);
    const sweepingEnd = new Date(session.sweepingEnd);
    const alertTime = new Date(session.alertTime);

    const hoursUntil = Math.max(
      0,
      Math.round((sweepingStart.getTime() - now.getTime()) / (1000 * 60 * 60))
    );

    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    };

    return NextResponse.json({
      isParked: true,
      session,
      details: {
        formattedNextSweeping: `${sweepingStart.toLocaleDateString('en-US', dateOptions)} (${formatTimeRange(
          session.fromHour,
          session.toHour
        )})`,
        formattedAlertTime: alertTime.toLocaleDateString('en-US', {
          ...dateOptions,
          hour: 'numeric',
          minute: '2-digit',
        }),
        hoursUntilSweeping: hoursUntil,
        isSweepingNow: now >= sweepingStart && now <= sweepingEnd,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
