import { NextResponse } from 'next/server';
import { getLeverageHistory } from '@/lib/leverage-server';

// Full weekly history (MTF + futures OI + market cap + Nifty) for the Leverage tab.
export async function GET() {
  try {
    return NextResponse.json(await getLeverageHistory());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
