import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  const diagnostics: any = {
    supabaseUrlConfigured: Boolean(url),
    supabaseKeyConfigured: Boolean(key),
    urlPreview: url ? url.substring(0, 25) + '...' : null,
    keyPreview: key ? key.substring(0, 15) + '...' : null,
  };

  if (!url || !key) {
    return NextResponse.json({
      status: 'CONFIG_MISSING',
      message: 'SUPABASE_URL or SUPABASE_ANON_KEY is missing from Netlify environment variables.',
      diagnostics,
    });
  }

  const cleanUrl = url.trim().replace(/\/rest\/v1\/?$/, '');
  const supabase = createClient(cleanUrl, key.trim());

  try {
    const { data, error } = await supabase
      .from('parking_sessions')
      .select('*')
      .limit(5);

    if (error) {
      return NextResponse.json({
        status: 'DATABASE_ERROR',
        error: error.message,
        code: error.code,
        hint: error.hint || (error.code === '42501' ? 'Row-level security policy violation. Run: ALTER TABLE parking_sessions DISABLE ROW LEVEL SECURITY;' : null),
        diagnostics,
      });
    }

    return NextResponse.json({
      status: 'CONNECTED',
      message: 'Supabase is fully connected and working!',
      recordsCount: data ? data.length : 0,
      activeSessions: data ? data.filter((s: any) => !s.cleared_at) : [],
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
