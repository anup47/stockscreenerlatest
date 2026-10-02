// Side-effect import for local scripts. Parses env files by hand because .env.local has a
// UTF-8 BOM, which breaks `node --env-file`. .env.production.local (from `vercel env pull`)
// comes first so its live blob token wins over the stale one in .env.local.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

for (const f of ['.env.production.local', '.env.local']) {
  const envFile = path.resolve(import.meta.dirname, '..', f);
  if (!existsSync(envFile)) continue;
  for (const line of readFileSync(envFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
