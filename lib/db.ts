import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export interface ParkingSession {
  id: string;
  segmentId: string;
  corridor: string;
  limits: string;
  side: string;
  weekday: string;
  fromHour: number;
  toHour: number;
  sweepingStart: string; // ISO string
  sweepingEnd: string;   // ISO string
  alertTime: string;     // ISO string
  alertSent: boolean;
  parkedAt: string;      // ISO string
  clearedAt: string | null; // ISO string or null
}

// In serverless environments (Netlify / Vercel), /tmp is the only writable directory
const LOCAL_STORAGE_PATH =
  process.env.NODE_ENV === 'production'
    ? '/tmp/parking_session.json'
    : path.join(process.cwd(), 'data', 'parking_session.json');

function getSupabaseClient() {
  let url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  url = url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  return createClient(url, key.trim());
}

export async function getActiveSession(): Promise<ParkingSession | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      // Query uncleared sessions ordered by newest parked_at first
      const { data, error } = await supabase
        .from('parking_sessions')
        .select('*')
        .is('cleared_at', null)
        .order('parked_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Supabase query error:', error.message, error.details);
      } else if (data && data.length > 0) {
        // Take the newest active session
        const activeRow = data[0];

        // Clean up any older lingering active sessions in background
        if (data.length > 1) {
          const olderIds = data.slice(1).map((r: any) => r.id);
          (async () => {
            try {
              await supabase
                .from('parking_sessions')
                .update({ cleared_at: new Date().toISOString() })
                .in('id', olderIds);
            } catch (err) {
              console.warn('Failed to clean up older sessions:', err);
            }
          })();
        }

        return {
          id: activeRow.id,
          segmentId: activeRow.segment_id,
          corridor: activeRow.corridor,
          limits: activeRow.limits,
          side: activeRow.side,
          weekday: activeRow.weekday,
          fromHour: activeRow.from_hour,
          toHour: activeRow.to_hour,
          sweepingStart: activeRow.sweeping_start,
          sweepingEnd: activeRow.sweeping_end,
          alertTime: activeRow.alert_time,
          alertSent: activeRow.alert_sent,
          parkedAt: activeRow.parked_at,
          clearedAt: activeRow.cleared_at,
        };
      }
    } catch (err) {
      console.error('Supabase exception:', err);
    }
  }

  // Fallback to local filesystem storage (/tmp in production)
  try {
    if (fs.existsSync(LOCAL_STORAGE_PATH)) {
      const content = fs.readFileSync(LOCAL_STORAGE_PATH, 'utf-8');
      const session: ParkingSession = JSON.parse(content);
      if (!session.clearedAt) {
        return session;
      }
    }
  } catch (err) {
    console.error('Error reading local parking session:', err);
  }
  return null;
}

export async function saveNewParkingSession(
  session: Omit<ParkingSession, 'id' | 'clearedAt' | 'alertSent' | 'parkedAt'>
): Promise<ParkingSession> {
  const newSession: ParkingSession = {
    ...session,
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    alertSent: false,
    parkedAt: new Date().toISOString(),
    clearedAt: null,
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      // 1. Explicitly clear all existing active sessions by primary key
      const { data: activeRows } = await supabase
        .from('parking_sessions')
        .select('id')
        .is('cleared_at', null);

      if (activeRows && activeRows.length > 0) {
        const ids = activeRows.map((r: any) => r.id);
        const { error: clearErr } = await supabase
          .from('parking_sessions')
          .update({ cleared_at: new Date().toISOString() })
          .in('id', ids);

        if (clearErr) {
          console.warn('Supabase clear previous sessions warning:', clearErr.message);
        }
      }

      // 2. Insert new session
      const { error: insertError } = await supabase.from('parking_sessions').insert({
        id: newSession.id,
        segment_id: newSession.segmentId,
        corridor: newSession.corridor,
        limits: newSession.limits,
        side: newSession.side,
        weekday: newSession.weekday,
        from_hour: newSession.fromHour,
        to_hour: newSession.toHour,
        sweeping_start: newSession.sweepingStart,
        sweeping_end: newSession.sweepingEnd,
        alert_time: newSession.alertTime,
        alert_sent: false,
        parked_at: newSession.parkedAt,
        cleared_at: null,
      });

      if (insertError) {
        console.error('CRITICAL: Failed to save to Supabase:', insertError.message, insertError.details, insertError.hint, insertError.code);
      } else {
        console.log('Successfully saved session to Supabase:', newSession.id);
      }
    } catch (err) {
      console.error('CRITICAL: Supabase exception during save:', err);
    }
  }

  // Always write to local storage as fallback / cache
  try {
    fs.mkdirSync(path.dirname(LOCAL_STORAGE_PATH), { recursive: true });
    fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(newSession, null, 2));
  } catch (err) {
    console.error('Error writing local session file:', err);
  }

  return newSession;
}

export async function clearActiveParkingSession(sessionId?: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      if (sessionId) {
        await supabase
          .from('parking_sessions')
          .update({ cleared_at: new Date().toISOString() })
          .eq('id', sessionId);
      } else {
        const { data: activeRows } = await supabase
          .from('parking_sessions')
          .select('id')
          .is('cleared_at', null);

        if (activeRows && activeRows.length > 0) {
          const ids = activeRows.map((r: any) => r.id);
          await supabase
            .from('parking_sessions')
            .update({ cleared_at: new Date().toISOString() })
            .in('id', ids);
        }
      }
    } catch (err) {
      console.error('Supabase clear error:', err);
    }
  }

  try {
    if (fs.existsSync(LOCAL_STORAGE_PATH)) {
      const content = fs.readFileSync(LOCAL_STORAGE_PATH, 'utf-8');
      const session: ParkingSession = JSON.parse(content);
      if (!sessionId || session.id === sessionId) {
        session.clearedAt = new Date().toISOString();
        fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(session, null, 2));
      }
    }
    return true;
  } catch (err) {
    console.error('Error clearing local parking session:', err);
    return false;
  }
}

export async function markAlertAsSent(sessionId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase
        .from('parking_sessions')
        .update({ alert_sent: true })
        .eq('id', sessionId);
    } catch (err) {
      console.error('Supabase mark alert error:', err);
    }
  }

  try {
    if (fs.existsSync(LOCAL_STORAGE_PATH)) {
      const content = fs.readFileSync(LOCAL_STORAGE_PATH, 'utf-8');
      const session: ParkingSession = JSON.parse(content);
      if (session.id === sessionId) {
        session.alertSent = true;
        fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(session, null, 2));
      }
    }
    return true;
  } catch (err) {
    console.error('Error marking alert sent:', err);
    return false;
  }
}
