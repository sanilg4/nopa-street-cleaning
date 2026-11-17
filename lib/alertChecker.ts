import { getActiveSession, markAlertAsSent } from './db';
import { sendTelegramAlert, sendTelegramConfirmation } from './telegram';
import { sendWhatsAppAlert } from './whatsapp';
import { resolveSessionTiming } from './sweeping';

export interface AlertCheckResult {
  status:
    | 'no_active_session'
    | 'already_sent'
    | 'skipped_short_notice'
    | 'sweeping_already_ended'
    | 'alert_sent'
    | 'test_sent'
    | 'pending'
    | 'send_failed';
  httpStatus: number;
  payload: Record<string, any>;
}

export async function runAlertCheck(now: Date = new Date()): Promise<AlertCheckResult> {
  const session = await getActiveSession();
  if (!session) {
    return {
      status: 'no_active_session',
      httpStatus: 200,
      payload: { message: 'No active parking session.' },
    };
  }

  if (session.alertSent) {
    return {
      status: 'already_sent',
      httpStatus: 200,
      payload: { message: 'Alert already sent for this session.', sessionId: session.id },
    };
  }

  const timing = resolveSessionTiming(session, now);

  if (timing.skipAlert) {
    await markAlertAsSent(session.id);
    return {
      status: 'skipped_short_notice',
      httpStatus: 200,
      payload: {
        message: 'Parked within 12h of sweeping; separate reminder skipped.',
        sessionId: session.id,
      },
    };
  }

  if (now.getTime() >= timing.sweepingEnd.getTime()) {
    return {
      status: 'sweeping_already_ended',
      httpStatus: 200,
      payload: {
        message: 'Sweeping window has already ended.',
        sessionId: session.id,
        sweepingEnd: timing.sweepingEnd.toISOString(),
      },
    };
  }

  if (now.getTime() >= timing.alertTime.getTime()) {
    const [tgRes, waRes] = await Promise.allSettled([
      sendTelegramAlert({
        corridor: session.corridor,
        limits: session.limits,
        side: session.side,
        formattedNextSweeping: timing.formattedNextSweeping,
        hoursUntilSweeping: timing.hoursUntilSweeping,
        sessionId: session.id,
        noticeHours: timing.noticeHours,
      }),
      sendWhatsAppAlert({
        corridor: session.corridor,
        limits: session.limits,
        side: session.side,
        formattedNextSweeping: timing.formattedNextSweeping,
        hoursUntilSweeping: timing.hoursUntilSweeping,
        noticeHours: timing.noticeHours,
      }),
    ]);

    const tgSent = tgRes.status === 'fulfilled' && tgRes.value === true;
    const waSent = waRes.status === 'fulfilled' && waRes.value === true;
    const sent = tgSent || waSent;

    if (sent) {
      await markAlertAsSent(session.id);
      return {
        status: 'alert_sent',
        httpStatus: 200,
        payload: {
          status: 'alert_sent',
          sessionId: session.id,
          corridor: session.corridor,
          sweeping: timing.formattedNextSweeping,
          noticeHours: timing.noticeHours,
          channels: { telegram: tgSent, whatsapp: waSent },
        },
      };
    }

    return {
      status: 'send_failed',
      httpStatus: 500,
      payload: {
        error: 'Failed to send alert via Telegram or WhatsApp',
        sessionId: session.id,
      },
    };
  }

  return {
    status: 'pending',
    httpStatus: 200,
    payload: {
      status: 'pending',
      sessionId: session.id,
      noticeHours: timing.noticeHours,
      alertScheduledFor: timing.alertTime.toISOString(),
      alertScheduledFormatted: timing.formattedAlertTime,
      sweeping: timing.formattedNextSweeping,
      now: now.toISOString(),
    },
  };
}

/**
 * Read-only Telegram verification check.
 * Reads the currently saved parking session (if any) without modifying Supabase
 * or marking alert_sent, and sends a clearly labeled [TEST] message to Telegram.
 */
export async function runAlertTestCheck(now: Date = new Date()): Promise<AlertCheckResult> {
  const session = await getActiveSession();

  if (!session) {
    const msg =
      `🧪 <b>[TEST] Street Cleaning Reminder (24h Notice)</b>\n\n` +
      `No car is currently marked parked in the app right now.\n\n` +
      `<i>Test check passed! Your Netlify + Telegram 24h reminder pipeline is connected and working.</i>`;

    const tgSent = await sendTelegramConfirmation(msg);
    if (tgSent) {
      return {
        status: 'test_sent',
        httpStatus: 200,
        payload: {
          status: 'test_sent',
          isParked: false,
          message: 'Test Telegram message sent (no car currently parked).',
          channels: { telegram: true },
        },
      };
    }

    return {
      status: 'send_failed',
      httpStatus: 500,
      payload: {
        error: 'Failed to send test message via Telegram.',
        isParked: false,
      },
    };
  }

  const timing = resolveSessionTiming(session, now);

  const tgSent = await sendTelegramAlert({
    corridor: session.corridor,
    limits: session.limits,
    side: session.side,
    formattedNextSweeping: timing.formattedNextSweeping,
    hoursUntilSweeping: timing.hoursUntilSweeping,
    sessionId: session.id,
    noticeHours: timing.noticeHours,
    isTest: true,
    formattedAlertTime: timing.formattedAlertTime,
    alertAlreadySent: session.alertSent,
    skipAlert: timing.skipAlert,
  });

  if (tgSent) {
    return {
      status: 'test_sent',
      httpStatus: 200,
      payload: {
        status: 'test_sent',
        isParked: true,
        readOnly: true,
        sessionId: session.id,
        corridor: session.corridor,
        side: session.side,
        limits: session.limits,
        sweeping: timing.formattedNextSweeping,
        noticeHours: timing.noticeHours,
        alertScheduledFor: timing.alertTime.toISOString(),
        alertScheduledFormatted: timing.formattedAlertTime,
        alertAlreadySent: session.alertSent,
        channels: { telegram: true },
      },
    };
  }

  return {
    status: 'send_failed',
    httpStatus: 500,
    payload: {
      error: 'Failed to send test alert via Telegram.',
      isParked: true,
      sessionId: session.id,
    },
  };
}
