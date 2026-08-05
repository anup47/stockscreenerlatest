import { NextRequest, NextResponse } from 'next/server';
import { fetchEquityIntraday315 }    from '@/lib/dhan-api';

export const dynamic     = 'force-dynamic';
export const maxDuration = 55;

// Returns the Dhan intraday LTP at 3:15 PM IST for the relevant trading session.
// Date selection:
//   - If IST >= 3:15 PM on a weekday  →  today   (auto-capture is firing right now)
//   - Otherwise                        →  previous weekday (Set Prev Close clicked before open)

function istNow(): { date: string; mins: number; day: number } {
  const istMs = Date.now() + (5 * 3600 + 30 * 60) * 1000;
  const ist   = new Date(istMs);
  return {
    date: `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`,
    mins: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    day:  ist.getUTCDay(),
  };
}

function prevWeekday(dateIST: string): string {
  const d = new Date(dateIST + 'T00:00:00Z');
  do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

function targetSessionDate(): string {
  const { date, mins, day } = istNow();
  // After 3:15 PM on a trading weekday → use today's session
  if (day !== 0 && day !== 6 && mins >= 15 * 60 + 15) return date;
  // Before market / weekend → use previous weekday
  return prevWeekday(date);
}

export async function GET(req: NextRequest) {
  const raw        = req.nextUrl.searchParams.get('symbols') ?? '';
  const nseSymbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!nseSymbols.length) return NextResponse.json({ prices: {} });

  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json({ prices: {}, error: 'Dhan credentials required' }, { status: 401 });
  }

  const date    = targetSessionDate();
  const dhanMap = await fetchEquityIntraday315(nseSymbols, clientId, accessToken, date);

  const prices: Record<string, number> = {};
  for (const [sym, price] of dhanMap) prices[sym] = price;

  return NextResponse.json({ prices, date, source: 'dhan-intraday' });
}
