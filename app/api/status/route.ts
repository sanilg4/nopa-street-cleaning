import { NextResponse } from 'next/server';
import { getActiveSession } from '@/lib/db';
import { resolveSessionTiming, StreetSegment } from '@/lib/sweeping';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Surrogate-Control': 'no-store',
};

let cachedSegments: StreetSegment[] | null = null;
function getSegments(): StreetSegment[] {
  if (!cachedSegments) {
    const filePath = path.join(process.cwd(), 'data', 'nopa_segments.json');
    if (fs.existsSync(filePath)) {
      cachedSegments = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  }
  return cachedSegments || [];
}

export async function GET(req: Request) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json(
        {
          isParked: false,
          session: null,
          clearedAt: new Date().toISOString(),
        },
        {
          headers: NO_CACHE_HEADERS,
        }
      );
    }

    const allSegments = getSegments();
    const segment = allSegments.find((s) => String(s.id) === String(session.segmentId));

    const now = new Date();
    const timing = resolveSessionTiming(session, now);

    return NextResponse.json(
      {
        isParked: true,
        session: {
          ...session,
          coordinates: segment?.coordinates || null,
          sideLR: segment?.sideLR || 'L',
        },
        details: {
          formattedNextSweeping: timing.formattedNextSweeping,
          formattedAlertTime: timing.formattedAlertTime,
          hoursUntilSweeping: timing.hoursUntilSweeping,
          isSweepingNow: timing.isSweepingNow,
        },
      },
      {
        headers: NO_CACHE_HEADERS,
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
