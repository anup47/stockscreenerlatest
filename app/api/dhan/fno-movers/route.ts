import { NextResponse } from 'next/server';
import { fetchFnoMovers } from '@/lib/dhan-api';

export const maxDuration = 20;

export async function GET() {
  const movers = await fetchFnoMovers();
  return NextResponse.json({ movers, fetchedAt: new Date().toISOString() });
}
