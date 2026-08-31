import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { calculateNextSweeping, StreetSegment } from '@/lib/sweeping';
import { saveNewParkingSession } from '@/lib/db';
import { sendTelegramConfirmation } from '@/lib/telegram';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import fs from 'fs';
import path from 'path';

let cachedSegments: StreetSegment[] | null = null;
function getSegments(): StreetSegment[] {
  if (!cachedSegments) {
    const filePath = path.join(process.cwd(), 'data', 'nopa_segments.json');
    if (fs.existsSync(filePath)) {
      cachedSegments = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  }
  return cachedSegments || [];
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    let segment: StreetSegment = body.segment;

    // Defensive: look up segment by segmentId if whole segment object was not passed
    if (!segment && body.segmentId) {
      const all = getSegments();
      segment = all.find((s) => s.id === body.segmentId)!;
    }

    if (!segment || !segment.id || !segment.weekday) {
      console.error('Invalid segment data received:', body);
      return NextResponse.json({ error: 'Invalid segment data' }, { status: 400 });
    }

    const now = new Date();
    const sweepingResult = calculateNextSweeping(segment, now);

    if (!sweepingResult) {
      return NextResponse.json({ error: 'Could not calculate next sweeping window' }, { status: 500 });
    }

    const newSession = await saveNewParkingSession({
      segmentId: segment.id,
      corridor: segment.corridor,
      limits: segment.limits,
      side: segment.side,
      weekday: segment.weekday,
      fromHour: segment.fromHour,
      toHour: segment.toHour,
      sweepingStart: sweepingResult.startTime.toISOString(),
      sweepingEnd: sweepingResult.endTime.toISOString(),
      alertTime: sweepingResult.alertTime.toISOString(),
    });

    // Send real-time confirmation to Telegram and WhatsApp
    const confirmationMsg =
      `🚗 *Car Parked!*\n\n` +
      `📍 *Location:* ${segment.corridor} (${segment.side} side)\n` +
      `🛣 *Block:* ${segment.limits}\n` +
      `🧹 *Next Sweeping:* ${sweepingResult.formattedNextSweeping}\n` +
      `⏰ *12h Reminder:* ${sweepingResult.formattedAlertTime}`;

    sendTelegramConfirmation(confirmationMsg).catch((e) => console.error('TG confirm error:', e));
    sendWhatsAppMessage(confirmationMsg).catch((e) => console.error('WhatsApp confirm error:', e));

    return NextResponse.json({
      success: true,
      session: newSession,
      details: sweepingResult,
    });
  } catch (err: any) {
    console.error('Error in /api/park:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
