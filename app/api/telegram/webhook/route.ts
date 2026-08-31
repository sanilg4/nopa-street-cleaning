import { NextRequest, NextResponse } from 'next/server';
import { clearActiveParkingSession } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (update.callback_query) {
      const { id: queryId, data, message, from } = update.callback_query;
      const userName = from.first_name || from.username || 'Someone';

      if (data && data.startsWith('clear_parking:')) {
        const sessionId = data.replace('clear_parking:', '');
        await clearActiveParkingSession(sessionId);

        // Acknowledge the button tap in Telegram
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callback_query_id: queryId,
              text: '✅ Car moved! Street cleaning alert cleared.',
            }),
          });

          // Edit the original message to reflect that the car was moved
          if (message && message.message_id && message.chat && message.chat.id) {
            const updatedText = `${message.text}\n\n✅ *Moved by ${userName}! Alert cleared.*`;
            await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: message.chat.id,
                message_id: message.message_id,
                text: updatedText,
                parse_mode: 'Markdown',
              }),
            });
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
