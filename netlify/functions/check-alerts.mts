import type { Config, Context } from '@netlify/functions';
import { runAlertCheck } from '../../lib/alertChecker';

const RUNTIME_ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'WHATSAPP_PHONE_1',
  'WHATSAPP_APIKEY_1',
  'WHATSAPP_PHONE_2',
  'WHATSAPP_APIKEY_2',
];

function syncNetlifyEnv() {
  const netlifyEnv = (globalThis as any).Netlify?.env;
  if (!netlifyEnv || typeof netlifyEnv.get !== 'function') return;
  for (const key of RUNTIME_ENV_KEYS) {
    if (!process.env[key]) {
      const val = netlifyEnv.get(key);
      if (val) {
        process.env[key] = val;
      }
    }
  }
}

export default async (req: Request, _context: Context) => {
  syncNetlifyEnv();
  const payload = await req.json().catch(() => ({}));
  const result = await runAlertCheck();

  console.log(
    'Netlify scheduled street cleaning check:',
    JSON.stringify({
      nextRun: payload?.next_run ?? null,
      status: result.status,
      payload: result.payload,
    })
  );

  return Response.json(result.payload, { status: result.httpStatus });
};

// Runs every 15 minutes in UTC (checks Pacific Time sweeping thresholds in Supabase)
export const config: Config = {
  schedule: '*/15 * * * *',
};
