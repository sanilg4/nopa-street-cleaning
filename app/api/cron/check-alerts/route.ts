import { NextRequest, NextResponse } from 'next/server';
import { runAlertCheck, runAlertTestCheck } from '@/lib/alertChecker';
import { isAuthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const isTest = req.nextUrl.searchParams.get('test') === '1';
    if (isTest) {
      if (!isAuthorized(req)) {
        return NextResponse.json(
          { error: 'Unauthorized: PIN required for test alert' },
          { status: 401 }
        );
      }
      const testResult = await runAlertTestCheck();
      return NextResponse.json(testResult.payload, { status: testResult.httpStatus });
    }

    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await runAlertCheck();
    return NextResponse.json(result.payload, { status: result.httpStatus });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
