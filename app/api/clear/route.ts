import { NextRequest, NextResponse } from 'next/server';
import { clearActiveParkingSession, getActiveSession } from '@/lib/db';
import { sendTelegramConfirmation } from '@/lib/telegram';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
};

export async function POST(req: NextRequest) {
  try {
    const active = await getActiveSession();
    await clearActiveParkingSession();

    if (active) {
      const msg = `🚗 <b>Car Moved:</b> Active parking alert for ${active.corridor} has been cleared.`;
      await Promise.allSettled([
        sendTelegramConfirmation(msg),
        sendWhatsAppMessage(msg),
      ]);
    }

    return NextResponse.json(
      {
        success: true,
        clearedAt: new Date().toISOString(),
      },
      {
        headers: NO_CACHE_HEADERS,
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
