import { afterEach, describe, expect, it } from 'vitest';
import { PocketBaseStore } from './pocketbase-store';

/** An unsigned token PocketBase's auth store accepts as valid until `exp`. */
function token(expSeconds: number): string {
  const part = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ id: 'u1', type: 'auth', exp: expSeconds })}.sig`;
}

const record = {
  id: 'u1',
  collectionId: '_pb_users_auth_',
  collectionName: 'users',
  email: 'coach@srt.local',
  name: 'Cam Coach',
  role: 'coach',
  default_team: '',
  preferences: null,
  avatar: '',
  created: '2026-09-01 12:00:00.000Z',
  updated: '2026-09-01 12:00:00.000Z',
};

describe('PocketBaseStore auth.user', () => {
  afterEach(() => localStorage.clear());

  it('is the same object until the session changes', () => {
    const store = new PocketBaseStore('http://127.0.0.1:1');
    expect(store.auth.user).toBeNull();
    const t = token(Math.floor(Date.now() / 1000) + 3600);
    store.pb.authStore.save(t, record);

    // In the browser the auth store re-reads local storage on every access, so its record is
    // a new object each time. useCurrentUser (useSyncExternalStore) needs a stable snapshot, or
    // React loops until "Maximum update depth exceeded" (every signed-in page crashed).
    const first = store.auth.user;
    expect(first?.name).toBe('Cam Coach');
    expect(store.auth.user).toBe(first);
    expect(store.auth.user).toBe(first);

    store.pb.authStore.save(t, { ...record, name: 'Cam Coach Jr' });
    const renamed = store.auth.user;
    expect(renamed).not.toBe(first);
    expect(renamed?.name).toBe('Cam Coach Jr');
    expect(store.auth.user).toBe(renamed);

    store.pb.authStore.clear();
    expect(store.auth.user).toBeNull();
  });
});
