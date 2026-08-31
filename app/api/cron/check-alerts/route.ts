import { NextRequest, NextResponse } from 'next/server';
import { getActiveSession, markAlertAsSent } from '@/lib/db';
import { sendTelegramAlert } from '@/lib/telegram';
import { formatTimeRange } from '@/lib/sweeping';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json({ message: 'No active parking session.' });
    }

    if (session.alertSent) {
      return NextResponse.json({ message: 'Alert already sent for this session.' });
    }

    const now = new Date();
    const alertTime = new Date(session.alertTime);
    const sweepingStart = new Date(session.sweepingStart);

    // If current time is past the 12-hour alert threshold
    if (now.getTime() >= alertTime.getTime()) {
      const hoursUntil = Math.max(
        0,
        Math.round((sweepingStart.getTime() - now.getTime()) / (1000 * 60 * 60))
      );

      const dateOptions: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      };
      const formattedNextSweeping = `${sweepingStart.toLocaleDateString(
        'en-US',
        dateOptions
      )} (${formatTimeRange(session.fromHour, session.toHour)})`;

      const sent = await sendTelegramAlert({
        corridor: session.corridor,
        limits: session.limits,
        side: session.side,
        formattedNextSweeping,
        hoursUntilSweeping: hoursUntil,
        sessionId: session.id,
      });

      if (sent) {
        await markAlertAsSent(session.id);
        return NextResponse.json({
          status: 'alert_sent',
          corridor: session.corridor,
          sweeping: formattedNextSweeping,
        });
      } else {
        return NextResponse.json({ error: 'Failed to send Telegram message' }, { status: 500 });
      }
    }

    return NextResponse.json({
      status: 'pending',
      alertScheduledFor: alertTime.toISOString(),
      now: now.toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
