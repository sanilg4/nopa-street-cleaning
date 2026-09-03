import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { calculateNextSweeping, StreetSegment } from '@/lib/sweeping';
import { saveNewParkingSession } from '@/lib/db';
import { sendTelegramConfirmation } from '@/lib/telegram';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
};

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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_CACHE_HEADERS });
  }

  try {
    const body = await req.json();
    let segment: StreetSegment = body.segment;

    // Defensive: look up segment by segmentId if whole segment object was not passed
    if (!segment && body.segmentId) {
      const all = getSegments();
      segment = all.find((s) => String(s.id) === String(body.segmentId))!;
    }

    if (!segment || !segment.id || !segment.weekday) {
      console.error('Invalid segment data received:', body);
      return NextResponse.json({ error: 'Invalid segment data' }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const now = new Date();
    const sweepingResult = calculateNextSweeping(segment, now);

    if (!sweepingResult) {
      return NextResponse.json({ error: 'Could not calculate next sweeping window' }, { status: 500, headers: NO_CACHE_HEADERS });
    }

    const newSession = await saveNewParkingSession({
      segmentId: String(segment.id),
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
      `🚗 <b>Car Parked!</b>\n\n` +
      `📍 <b>Location:</b> ${segment.corridor} (${segment.side} side)\n` +
      `🛣 <b>Block:</b> ${segment.limits}\n` +
      `🧹 <b>Next Sweeping:</b> ${sweepingResult.formattedNextSweeping}\n` +
      `⏰ <b>12h Reminder:</b> ${sweepingResult.formattedAlertTime}`;

    // Await delivery before serverless shuts down
    await Promise.allSettled([
      sendTelegramConfirmation(confirmationMsg),
      sendWhatsAppMessage(confirmationMsg),
    ]);

    return NextResponse.json(
      {
        success: true,
        session: newSession,
        details: sweepingResult,
      },
      {
        headers: NO_CACHE_HEADERS,
      }
    );
  } catch (err: any) {
    console.error('Error in /api/park:', err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
