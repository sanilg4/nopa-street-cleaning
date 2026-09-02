import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const LOCAL_STORAGE_PATH =
  process.env.NODE_ENV === 'production'
    ? '/tmp/parking_session.json'
    : path.join(process.cwd(), 'data', 'parking_session.json');

export async function GET(req: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  let localFileContent = null;
  try {
    if (fs.existsSync(LOCAL_STORAGE_PATH)) {
      localFileContent = JSON.parse(fs.readFileSync(LOCAL_STORAGE_PATH, 'utf-8'));
    }
  } catch (e: any) {
    localFileContent = { error: e.message };
  }

  const diagnostics: any = {
    supabaseUrlConfigured: Boolean(url),
    supabaseKeyConfigured: Boolean(key),
    urlPreview: url ? url.substring(0, 25) + '...' : null,
    keyPreview: key ? key.substring(0, 15) + '...' : null,
    localTmpSession: localFileContent,
  };

  if (!url || !key) {
    return NextResponse.json({
      status: 'CONFIG_MISSING',
      message: 'SUPABASE_URL or SUPABASE_ANON_KEY is missing from Netlify environment variables.',
      diagnostics,
    });
  }

  const cleanUrl = url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const supabase = createClient(cleanUrl, key.trim());

  // Optional: check if query param ?action=clear_all was sent to reset stuck sessions
  const urlObj = new URL(req.url);
  const action = urlObj.searchParams.get('action');
  if (action === 'clear_all') {
    try {
      await supabase
        .from('parking_sessions')
        .update({ cleared_at: new Date().toISOString() })
        .is('cleared_at', null);

      if (fs.existsSync(LOCAL_STORAGE_PATH)) {
        try {
          fs.unlinkSync(LOCAL_STORAGE_PATH);
        } catch (e) {}
      }

      return NextResponse.json({
        status: 'CLEARED',
        message: 'All active parking sessions cleared in Supabase and local /tmp.',
      });
    } catch (e: any) {
      return NextResponse.json({ status: 'CLEAR_ERROR', error: e.message });
    }
  }

  try {
    // Test SELECT
    const { data: allRows, error: selectErr } = await supabase
      .from('parking_sessions')
      .select('*')
      .order('parked_at', { ascending: false })
      .limit(10);

    if (selectErr) {
      return NextResponse.json({
        status: 'DATABASE_ERROR',
        error: selectErr.message,
        code: selectErr.code,
        hint:
          selectErr.code === '42501'
            ? 'Row-level security policy violation. Run: ALTER TABLE parking_sessions DISABLE ROW LEVEL SECURITY; in Supabase SQL Editor.'
            : selectErr.hint,
        diagnostics,
      });
    }

    const activeSessions = allRows ? allRows.filter((s: any) => !s.cleared_at) : [];

    return NextResponse.json({
      status: 'CONNECTED',
      message: 'Supabase is fully connected and working!',
      totalRowsFound: allRows ? allRows.length : 0,
      activeSessionsCount: activeSessions.length,
      activeSessions,
      diagnostics,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 'EXCEPTION',
      error: err.message,
      diagnostics,
    });
  }
}
