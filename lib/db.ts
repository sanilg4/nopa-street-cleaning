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

const LOCAL_STORAGE_PATH = path.join(process.cwd(), 'data', 'parking_session.json');

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function getActiveSession(): Promise<ParkingSession | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('parking_sessions')
      .select('*')
      .is('cleared_at', null)
      .order('parked_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Supabase query error:', error);
      return null;
    }
    if (!data) return null;

    return {
      id: data.id,
      segmentId: data.segment_id,
      corridor: data.corridor,
      limits: data.limits,
      side: data.side,
      weekday: data.weekday,
      fromHour: data.from_hour,
      toHour: data.to_hour,
      sweepingStart: data.sweeping_start,
      sweepingEnd: data.sweeping_end,
      alertTime: data.alert_time,
      alertSent: data.alert_sent,
      parkedAt: data.parked_at,
      clearedAt: data.cleared_at,
    };
  }

  // Fallback to local filesystem storage
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
    // First, clear any existing active sessions
    await supabase
      .from('parking_sessions')
      .update({ cleared_at: new Date().toISOString() })
      .is('cleared_at', null);

    // Insert new session
    const { error } = await supabase.from('parking_sessions').insert({
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

    if (error) {
      console.error('Failed to save to Supabase:', error);
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
  const nowIso = new Date().toISOString();

  if (supabase) {
    let query = supabase.from('parking_sessions').update({ cleared_at: nowIso }).is('cleared_at', null);
    if (sessionId) {
      query = query.eq('id', sessionId);
    }
    const { error } = await query;
    if (error) {
      console.error('Error clearing Supabase session:', error);
      return false;
    }
  }

  try {
    if (fs.existsSync(LOCAL_STORAGE_PATH)) {
      const content = fs.readFileSync(LOCAL_STORAGE_PATH, 'utf-8');
      const session: ParkingSession = JSON.parse(content);
      if (!sessionId || session.id === sessionId) {
        session.clearedAt = nowIso;
        fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(session, null, 2));
      }
    }
  } catch (err) {
    console.error('Error updating local session file:', err);
  }

  return true;
}

export async function markAlertAsSent(sessionId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase
      .from('parking_sessions')
      .update({ alert_sent: true })
      .eq('id', sessionId);
    if (error) {
      console.error('Error updating alert_sent in Supabase:', error);
      return false;
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
  } catch (err) {
    console.error('Error marking alert sent in local session:', err);
  }

  return true;
}
