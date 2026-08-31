/**
 * WhatsApp integration for sending street cleaning alerts to you and your girlfriend.
 * 
 * Supports CallMeBot (Free WhatsApp Gateway) with zero setup/credit card:
 * - Phone numbers must be in international format (e.g. +14155551234)
 * - Environment variables:
 *   - WHATSAPP_PHONE_1: Your phone number (e.g. +14151234567)
 *   - WHATSAPP_APIKEY_1: Your CallMeBot API key
 *   - WHATSAPP_PHONE_2: Your girlfriend's phone number (optional)
 *   - WHATSAPP_APIKEY_2: Your girlfriend's CallMeBot API key (optional)
 */

interface SendAlertOptions {
  corridor: string;
  limits: string;
  side: string;
  formattedNextSweeping: string;
  hoursUntilSweeping: number;
}

export async function sendWhatsAppAlert(options: SendAlertOptions): Promise<boolean> {
  const text =
    `🚨 *Street Cleaning Reminder (12h Notice)*\n\n` +
    `🚗 *Car Parked:* ${options.corridor} (${options.side} side)\n` +
    `📍 *Block:* ${options.limits}\n` +
    `🧹 *Sweeping Window:* ${options.formattedNextSweeping}\n\n` +
    `Please move your car before sweeping begins!`;

  return sendWhatsAppMessage(text);
}

export async function sendWhatsAppMessage(message: string): Promise<boolean> {
  const recipients: Array<{ phone: string; apikey: string }> = [];

  if (process.env.WHATSAPP_PHONE_1 && process.env.WHATSAPP_APIKEY_1) {
    recipients.push({
      phone: process.env.WHATSAPP_PHONE_1.replace(/[^\d+]/g, ''),
      apikey: process.env.WHATSAPP_APIKEY_1.trim(),
    });
  }

  if (process.env.WHATSAPP_PHONE_2 && process.env.WHATSAPP_APIKEY_2) {
    recipients.push({
      phone: process.env.WHATSAPP_PHONE_2.replace(/[^\d+]/g, ''),
      apikey: process.env.WHATSAPP_APIKEY_2.trim(),
    });
  }

  if (recipients.length === 0) {
    console.warn('WhatsApp phone/apikey not configured.');
    return false;
  }

  let allSuccess = true;

  for (const { phone, apikey } of recipients) {
    try {
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
        phone
      )}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`;

      const res = await fetch(url);
      if (!res.ok) {
        allSuccess = false;
        console.error(`CallMeBot WhatsApp error for ${phone}: HTTP ${res.status}`);
      }
    } catch (err) {
      allSuccess = false;
      console.error(`Failed to send WhatsApp message to ${phone}:`, err);
    }
  }

  return allSuccess;
}
