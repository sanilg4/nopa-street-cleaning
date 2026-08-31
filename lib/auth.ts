import { NextRequest } from 'next/server';

export function isAuthorized(req: NextRequest): boolean {
  const configuredPin = process.env.APP_PIN || '1234';
  
  // Check cookie
  const cookiePin = req.cookies.get('app_pin')?.value;
  if (cookiePin === configuredPin) {
    return true;
  }

  // Check header
  const headerPin = req.headers.get('x-app-pin');
  if (headerPin === configuredPin) {
    return true;
  }

  return false;
}
