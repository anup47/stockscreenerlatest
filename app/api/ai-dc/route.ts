import { NextResponse } from 'next/server';
import { getAiDc } from '@/lib/ai-dc-server';

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await getAiDc());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
