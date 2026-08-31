import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

let cachedSegments: any = null;

export async function GET() {
  try {
    if (!cachedSegments) {
      const filePath = path.join(process.cwd(), 'data', 'nopa_segments.json');
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf-8');
        cachedSegments = JSON.parse(fileData);
      } else {
        return NextResponse.json({ error: 'Segment data not found' }, { status: 404 });
      }
    }

    return NextResponse.json(cachedSegments, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
