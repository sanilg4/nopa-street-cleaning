/**
 * Telegram Bot API integration for sending street cleaning alerts and handling
 * inline "I Moved the Car" button callbacks.
 */

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface SendAlertOptions {
  corridor: string;
  limits: string;
  side: string;
  formattedNextSweeping: string;
  hoursUntilSweeping: number;
  sessionId: string;
}

export async function sendTelegramAlert(options: SendAlertOptions): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured in environment.');
    return false;
  }

  const text =
    `🚨 <b>Street Cleaning Reminder (12h Notice)</b>\n\n` +
    `🚗 <b>Car Parked:</b> ${escapeHtml(options.corridor)} (${escapeHtml(options.side)} side)\n` +
    `📍 <b>Block:</b> ${escapeHtml(options.limits)}\n` +
    `🧹 <b>Sweeping Window:</b> ${escapeHtml(options.formattedNextSweeping)}\n\n` +
    `Please move your car before sweeping begins!`;

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: '✅ I Moved the Car',
          callback_data: `clear_parking:${options.sessionId}`,
        },
      ],
    ],
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram API error in sendTelegramAlert:', data);
    }
    return data.ok === true;
  } catch (err) {
    console.error('Failed to send Telegram alert:', err);
    return false;
  }
}

export async function sendTelegramConfirmation(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram API error response:', data);
      // Fallback without parse_mode if formatting had an issue
      const fallbackRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message.replace(/<[^>]*>?/gm, ''), // strip tags
        }),
      });
      const fallbackData = await fallbackRes.json();
      return fallbackData.ok === true;
    }
    return true;
  } catch (err) {
    console.error('Failed to send confirmation to Telegram:', err);
    return false;
  }
}
