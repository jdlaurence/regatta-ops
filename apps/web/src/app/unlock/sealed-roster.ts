// The junior rosters for the published demo (PLAN.md §18): first names and short last names,
// encrypted with the demo password, so the public site and the repository carry only ciphertext.
// Light protection by design, enough to keep strangers out: PBKDF2 and AES-GCM from Web Crypto,
// which the browser and Node 22 both have, so `pnpm pages:seal` and the unlock page share it.

import type { RosterAthlete } from '@regatta-ops/seed';

export interface SealedRoster {
  version: 1;
  /** PBKDF2-SHA256 rounds; kept with the data so a later change still opens older files. */
  iterations: number;
  salt: string;
  iv: string;
  /** AES-GCM over the JSON of the athletes. */
  data: string;
}

export const SEAL_ITERATIONS = 600_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/**
 * Each athlete's last name cut to the fewest letters that still tell teammates with the same
 * first name apart ("Avery R.", or "Avery Ro." and "Avery Ru."). The seed makes athlete ids
 * from the names, so they must stay unique within a team.
 */
export function shortenLastNames(athletes: readonly RosterAthlete[]): RosterAthlete[] {
  return athletes.map((a) => {
    const rivals = athletes.filter(
      (b) => b !== a && b.team === a.team && b.firstName === a.firstName,
    );
    let n = 1;
    while (
      n < a.lastName.length &&
      rivals.some((b) => b.lastName.startsWith(a.lastName.slice(0, n)))
    )
      n++;
    const lastName = n < a.lastName.length ? `${a.lastName.slice(0, n)}.` : a.lastName;
    return { ...a, lastName };
  });
}

/** The AES key for a password; extractable so the unlock page can remember it. */
export async function deriveKey(
  password: string,
  sealed: Pick<SealedRoster, 'salt' | 'iterations'>,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromBase64(sealed.salt),
      iterations: sealed.iterations,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function sealRoster(
  athletes: readonly RosterAthlete[],
  password: string,
  iterations = SEAL_ITERATIONS,
): Promise<SealedRoster> {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, { salt, iterations });
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(athletes)),
  );
  return { version: 1, iterations, salt, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

/** The athletes, or a rejection when the key is wrong (AES-GCM checks it). */
export async function openRoster(sealed: SealedRoster, key: CryptoKey): Promise<RosterAthlete[]> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
    key,
    fromBase64(sealed.data),
  );
  return JSON.parse(decoder.decode(plain)) as RosterAthlete[];
}

// ---------------------------------------------------------------------------
// Remembering the key on this device, so the password is asked for once.

const KEY_STORAGE = 'regatta-ops-pages-key-v1';

export async function rememberKey(key: CryptoKey): Promise<void> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  try {
    localStorage.setItem(KEY_STORAGE, toBase64(raw));
  } catch {
    // Storage can be unavailable (private windows); the password is asked for next time.
  }
}

/** The roster opened with the remembered key; null when there is none or it no longer fits. */
export async function openWithRememberedKey(sealed: SealedRoster): Promise<RosterAthlete[] | null> {
  let saved: string | null;
  try {
    saved = localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
  if (!saved) return null;
  try {
    const key = await crypto.subtle.importKey('raw', fromBase64(saved), 'AES-GCM', false, [
      'decrypt',
    ]);
    return await openRoster(sealed, key);
  } catch {
    // Sealed again with a new password since: forget the old key and ask.
    try {
      localStorage.removeItem(KEY_STORAGE);
    } catch {
      // Nothing to clean up.
    }
    return null;
  }
}
