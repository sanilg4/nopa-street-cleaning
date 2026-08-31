import { NextRequest, NextResponse } from 'next/server';
import { clearActiveParkingSession, getActiveSession } from '@/lib/db';
import { sendTelegramConfirmation } from '@/lib/telegram';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  try {
    const active = await getActiveSession();
    await clearActiveParkingSession();

    if (active) {
      const msg = `🚗 *Car Moved:* Active parking alert for ${active.corridor} has been cleared.`;
      sendTelegramConfirmation(msg).catch((e) => console.error(e));
      sendWhatsAppMessage(msg).catch((e) => console.error(e));
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
