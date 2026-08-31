import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { calculateNextSweeping, StreetSegment } from '@/lib/sweeping';
import { saveNewParkingSession } from '@/lib/db';
import { sendTelegramConfirmation } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { segmentId } = body;

    if (!segmentId) {
      return NextResponse.json({ error: 'segmentId is required' }, { status: 400 });
    }

    const segmentsPath = path.join(process.cwd(), 'data', 'nopa_segments.json');
    const fileData = fs.readFileSync(segmentsPath, 'utf-8');
    const segments: StreetSegment[] = JSON.parse(fileData);

    const segment = segments.find((s) => s.id === segmentId);
    if (!segment) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
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

    // Send confirmation to Telegram group
    const tgMsg =
      `🚗 *Car Parked!*\n\n` +
      `📍 *Location:* ${segment.corridor} (${segment.side} side)\n` +
      `🛣 *Block:* ${segment.limits}\n` +
      `🧹 *Next Sweeping:* ${sweepingResult.formattedNextSweeping}\n` +
      `⏰ *12h Reminder:* ${sweepingResult.formattedAlertTime}`;

    sendTelegramConfirmation(tgMsg).catch((e) => console.error('TG confirm error:', e));

    return NextResponse.json({
      success: true,
      session: newSession,
      details: sweepingResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
