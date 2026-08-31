# 🚗 NOPA Street Cleaning Alerts

A mobile-first web app and Telegram alert bot designed specifically for NOPA (North of the Panhandle) residents with an Area P parking permit in San Francisco.

Instead of parsing confusing street cleaning signs, the app provides an interactive map showing your live GPS location, highlights the street cleaning schedule for every curb in the neighborhood, and automatically sends a Telegram notification to a shared group chat 12 hours before street cleaning begins.

---

## Features

- **Live GPS Blue Dot:** Automatically tracks your phone's location so you can see exactly which block and curb you just pulled up to.
- **Interactive Curb Map:** 1,290 street sweeping segments across NOPA and Alamo Square extracted from the official SF Public Works DataSF dataset (`yhqp-riqs`), color-coded by urgency:
  - 🟢 **Green:** Sweeping is > 48 hours away (safe).
  - 🟡 **Amber:** Sweeping is in 24h – 48h.
  - 🔴 **Red:** Sweeping is in < 24h or today.
- **Official SF Schedule Engine:** Computes exact 1st/3rd vs 2nd/4th week-of-the-month sweeping schedules and respects official SFMTA legal holiday exemptions.
- **Shared Telegram Group Bot:** Free notifications sent to a shared group (you, your partner, and the bot).
- **One-Tap "I Moved the Car":** When the 12-hour reminder is sent, you can tap `[✅ I Moved the Car]` directly inside Telegram to clear the alert without opening the website.
- **Web "Clear Parking" & "Park Here Instead":** Easily clear your spot or immediately overwrite it with a single tap on the map when you re-park.
- **4-Digit Passcode Gate:** Keeps your car's real-time street location private from the public web with zero login hassle.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Map:** Leaflet with CartoDB Voyager tiles
- **Alert Worker:** Vercel Cron (runs every 15 minutes)
- **Database:** Supabase (PostgreSQL) with fallback to local JSON in development
- **Notifications:** Telegram Bot API

---

## Quick Start (Local Development)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your preferred 4-digit PIN (default `1234`).

3. **Run local dev server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` on your browser.

---

## Setting up the Telegram Bot (100% Free)

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`, name it (e.g. `NOPA Parking Bot`), and give it a username (e.g. `nopa_parking_alert_bot`).
3. Copy the HTTP API token and set it as `TELEGRAM_BOT_TOKEN`.
4. Create a new Telegram group with yourself, your partner, and your new bot.
5. Get your group chat ID:
   - Add `@RawDataBot` to the group (it will print the JSON with your `chat.id`, e.g. `-1001234567890`), then remove `@RawDataBot`.
   - Set this as `TELEGRAM_CHAT_ID`.
6. *(Optional)* Set up Webhook for the "I Moved the Car" button:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_DOMAIN>/api/telegram/webhook"
   ```

---

## Setting up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** tab and run the script in `schema.sql`.
3. In **Project Settings -> API**, copy:
   - `Project URL` -> `SUPABASE_URL`
   - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY`

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import the repository in [Vercel](https://vercel.com).
3. Under **Environment Variables**, add:
   - `APP_PIN`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Click **Deploy**. Vercel will automatically detect `vercel.json` and schedule the alert checker cron job!
