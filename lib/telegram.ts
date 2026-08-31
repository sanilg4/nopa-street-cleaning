/**
 * Telegram Bot API integration for sending street cleaning alerts and handling
 * inline "I Moved the Car" button callbacks.
 */

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
    `🚨 *Street Cleaning Reminder (12h Notice)*\n\n` +
    `🚗 *Car Parked:* ${options.corridor} (${options.side} side)\n` +
    `📍 *Block:* ${options.limits}\n` +
    `🧹 *Sweeping Window:* ${options.formattedNextSweeping}\n\n` +
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
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      }),
    });

    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    console.error('Failed to send Telegram alert:', err);
    return false;
  }
}

export async function sendTelegramConfirmation(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    console.error('Failed to send confirmation to Telegram:', err);
    return false;
  }
}
