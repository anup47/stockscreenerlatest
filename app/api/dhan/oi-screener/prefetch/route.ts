import { NextRequest, NextResponse } from 'next/server';
import { fetchDhanExpiry } from '@/lib/dhan-api';

// Lightweight Phase 1 — fetch expiry dates only (~1-2s)
// Called once by the client before firing the 4 parallel batch requests.
export async function GET(req: NextRequest) {
  const clientId    = req.headers.get('x-dhan-client-id')    ?? '';
  const accessToken = req.headers.get('x-dhan-access-token') ?? '';

  if (!clientId || !accessToken) {
    return NextResponse.json(
      { error: 'Missing Dhan credentials.' },
      { status: 401 },
    );
  }

  const [weeklyRes, midcpRes, stockRes] = await Promise.all([
    fetchDhanExpiry('NIFTY',      clientId, accessToken),
    fetchDhanExpiry('MIDCPNIFTY', clientId, accessToken),
    fetchDhanExpiry('RELIANCE',   clientId, accessToken),
  ]);

  const weeklyExpiry     = weeklyRes.data?.expiries?.[0] ?? null;
  const midcpExpiry      = midcpRes.data?.expiries?.[0]  ?? null;
  const allStockExpiries = stockRes.data?.expiries        ?? [];
  const stockExpiry      = allStockExpiries[0] ?? null;

  if (!weeklyExpiry || !stockExpiry) {
    return NextResponse.json({
      error: `Expiry fetch failed. NIFTY: ${weeklyRes.error ?? (weeklyExpiry ? 'ok' : 'empty')}  RELIANCE: ${stockRes.error ?? (stockExpiry ? 'ok' : 'empty')}`,
    }, { status: 502 });
  }

  return NextResponse.json({ weeklyExpiry, midcpExpiry, stockExpiry, stockExpiries: allStockExpiries });
}
