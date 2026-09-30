// Deterministic ids and hashing. PocketBase ids are 15 lowercase alphanumerics.

/** FNV-1a 32-bit, hex. Fast, deterministic, good enough for finding ids and fingerprints. */
export function hash32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A 15-character PocketBase-compatible id derived from `key`. Same key, same id, so seed data
 * is reproducible and relations survive a re-seed.
 */
export function stableId(key: string): string {
  let out = '';
  let salt = 0;
  while (out.length < 15) {
    const h = parseInt(hash32(`${salt}:${key}`), 16);
    let n = h;
    for (let i = 0; i < 5 && out.length < 15; i++) {
      out += ALPHABET[n % 36];
      n = Math.floor(n / 36);
    }
    salt++;
  }
  return out;
}
