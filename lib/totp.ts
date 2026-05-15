import { createHmac } from 'crypto';

// RFC 4648 base32 decode
function base32Decode(str: string): Buffer {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const s = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const out: number[] = [];
  let bits = 0, val = 0;
  for (const c of s) {
    const idx = CHARS.indexOf(c);
    if (idx === -1) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((val >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

// RFC 6238 TOTP
export function generateTOTP(secret: string, digits = 6, period = 30): string {
  const counter = Math.floor(Date.now() / 1000 / period);
  const buf = Buffer.alloc(8);
  // write 64-bit big-endian counter
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac  = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code   =
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) <<  8) |
     (hmac[offset + 3] & 0xff);

  return (code % Math.pow(10, digits)).toString().padStart(digits, '0');
}
