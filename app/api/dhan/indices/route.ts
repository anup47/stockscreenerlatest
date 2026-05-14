import { NextResponse } from 'next/server';
import { fetchNseIndices } from '@/lib/dhan-api';

export const maxDuration = 15;

export async function GET() {
  const indices = await fetchNseIndices();
  return NextResponse.json({ indices, fetchedAt: new Date().toISOString() });
}
