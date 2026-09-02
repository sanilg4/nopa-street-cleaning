import { NextRequest, NextResponse } from 'next/server';
import { clearActiveParkingSession, getActiveSession } from '@/lib/db';
import { sendTelegramConfirmation } from '@/lib/telegram';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

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

    return NextResponse.json({
      success: true,
      clearedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
