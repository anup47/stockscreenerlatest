import { NextResponse } from 'next/server';
import { getGpuMarket } from '@/lib/gpu-market-server';

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await getGpuMarket());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
