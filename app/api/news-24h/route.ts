import { NextResponse } from 'next/server';
import { readNewsFeed } from '@/lib/news-24h';

export async function GET() {
  return NextResponse.json(await readNewsFeed());
}
