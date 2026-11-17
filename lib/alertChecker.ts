import { getActiveSession, markAlertAsSent } from './db';
import { sendTelegramAlert } from './telegram';
import { sendWhatsAppAlert } from './whatsapp';
import { resolveSessionTiming } from './sweeping';

export interface AlertCheckResult {
  status:
    | 'no_active_session'
    | 'already_sent'
    | 'skipped_short_notice'
    | 'sweeping_already_ended'
    | 'alert_sent'
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
