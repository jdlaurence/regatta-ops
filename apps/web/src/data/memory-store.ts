// MemoryStore: the DataStore over an in-memory World (PLAN.md §7.1). Powers unit tests, the
// component gallery, and demo mode (`pnpm demo`, persisted to localStorage, no backend).
//
// It emulates the server behavior the UI depends on (PLAN.md §8.3), so demo mode behaves like
// the real app: created/updated timestamps, createdBy/updatedBy stamping, activity_log lines,
// entries.boatClass following its event, unique indexes, relation cascades, and change events.

import { COLLECTION_NAMES, type CollectionName, type User, type World } from '@regatta-ops/domain';
import { blobToDataUrl, type ImageCodec } from '../lib/image';
import { describeChange, type Lookup } from './activity';
import { isGuarded, sameStamp } from './concurrency';
import { assertFileField, MEMORY_FILE_MAX_BYTES, preparePhoto } from './files';
import { parseMentions, type MentionUser } from './mentions';
import { RELATIONS, STAMPED, UNIQUE, type RelationDef } from './schema';
import {
  applyQuery,
  newId,
  StoreError,
  type AuthApi,
  type BatchOp,
  type ChangeEvent,
  type ChangeHandler,
  type CreateInput,
  type DataStore,
  type FileCollection,
  type FileFieldOf,
  type FileUrlOptions,
  type ListQuery,
  type Patch,
  type RecordOf,
  type UpdateOptions,
} from './store';

type AnyRecord = Record<string, unknown> & { id: string };
type Tables = Map<CollectionName, Map<string, AnyRecord>>;

export interface MemoryStoreOptions {
  world: World;
  /** Save the world to localStorage under this key after every change (demo mode). */
  persistKey?: string;
  /** Remember the signed-in user id under this key (demo mode). */
  authKey?: string;
  /** Start signed in as this user. */
  userId?: string | null;
  /** Clock for created/updated stamps and activity; tests pass a fixed one. */
  now?: () => string;
  /** Rebuilds the world for resetDemo(). */
  reseed?: () => World;
  /** Stored alongside the world so a changed seed replaces stale demo data. */
  seedHash?: string;
  /**
   * Decodes and downscales photos before they are kept as data URLs; default: the browser's.
   * With none (Node, jsdom), a photo is kept as it is when it is small enough.
   */
  imageCodec?: ImageCodec | null;
}

interface Persisted {
  version: 1;
  seedHash?: string;
  savedAt: string;
  world: World;
}

const clone = <T>(v: T): T => structuredClone(v);

const CONFLICT_MESSAGE =
  'Someone else changed this first. The latest version is showing now; make your change again.';

const INCOMING: Map<CollectionName, [CollectionName, string, RelationDef][]> = (() => {
  const map = new Map<CollectionName, [CollectionName, string, RelationDef][]>();
  for (const collection of COLLECTION_NAMES) {
    for (const [field, def] of Object.entries(RELATIONS[collection])) {
      const list = map.get(def.target) ?? [];
      list.push([collection, field, def]);
      map.set(def.target, list);
    }
  }
  return map;
})();

const NOUNS: Partial<Record<CollectionName, string>> = {
  teams: 'team',
  athletes: 'athlete',
  users: 'user',
  shells: 'shell',
  oar_sets: 'oar set',
  trailers: 'trailer',
};

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

export class MemoryStore implements DataStore {
  readonly mode = 'memory' as const;
  readonly auth: AuthApi;

  private tables: Tables = new Map();
  private listeners = new Map<CollectionName, Set<ChangeHandler>>();
  private authListeners = new Set<(user: User | null) => void>();
  private userId: string | null;
  private cachedUser: User | null = null;
  private cachedUserStale = true;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Change events held back while a batch is running. */
  private held: (() => void)[] | null = null;
  /** Appended to activity summaries while a share-link write runs (updateViaShareLink). */
  private activitySuffix = '';
  private readonly opts: MemoryStoreOptions;

  constructor(opts: MemoryStoreOptions) {
    this.opts = opts;
    this.load(opts.world);
    this.userId = opts.userId ?? this.readAuth();
    if (this.userId && !this.table('users').has(this.userId)) this.userId = null;
    this.auth = this.createAuth();
  }

  // -------------------------------------------------------------------------
  // Reads

  async list<C extends CollectionName>(
    collection: C,
    query?: ListQuery<RecordOf<C>>,
  ): Promise<RecordOf<C>[]> {
    const rows = [...this.table(collection).values()] as unknown as RecordOf<C>[];
    return clone(applyQuery(rows, query));
  }

  async get<C extends CollectionName>(collection: C, id: string): Promise<RecordOf<C> | null> {
    const rec = this.table(collection).get(id);
    return rec ? (clone(rec) as unknown as RecordOf<C>) : null;
  }

  /** The whole dataset, for tests and debugging. */
  snapshot(): World {
    const world = {} as Record<CollectionName, AnyRecord[]>;
    for (const c of COLLECTION_NAMES) world[c] = clone([...this.table(c).values()]);
    return world as unknown as World;
  }

  // -------------------------------------------------------------------------
  // Writes

  async create<C extends CollectionName>(
    collection: C,
    data: CreateInput<RecordOf<C>>,
  ): Promise<RecordOf<C>> {
    return clone(this.createNow(collection, data)) as unknown as RecordOf<C>;
  }

  async update<C extends CollectionName>(
    collection: C,
    id: string,
    patch: Patch<RecordOf<C>>,
    options?: UpdateOptions,
  ): Promise<RecordOf<C>> {
    return clone(this.updateNow(collection, id, patch, options)) as unknown as RecordOf<C>;
  }

  async delete<C extends CollectionName>(collection: C, id: string): Promise<void> {
    this.deleteNow(collection, id);
  }

  async batch(ops: BatchOp[]): Promise<(RecordOf<CollectionName> | null)[]> {
    // All or nothing, like PocketBase's batch transaction: work on the live tables, restore
    // them if any step fails, and hold change events until every step has succeeded.
    const saved = new Map([...this.tables].map(([c, t]) => [c, new Map(t)]));
    this.held = [];
    const results: (RecordOf<CollectionName> | null)[] = [];
    try {
      for (const op of ops) {
        if (op.op === 'create') {
          results.push(clone(this.createNow(op.collection, op.data)) as never);
        } else if (op.op === 'update') {
          results.push(clone(this.updateNow(op.collection, op.id, op.patch)) as never);
        } else {
          this.deleteNow(op.collection, op.id);
          results.push(null);
        }
      }
    } catch (err) {
      this.tables = saved;
      this.held = null;
      this.cachedUserStale = true;
      this.save();
      throw err;
    }
    const held = this.held;
    this.held = null;
    for (const fire of held) fire();
    return results;
  }

  /**
   * Files live in the record as data URLs (there is no file server in demo mode), downscaled to
   * 1600 px and at most 1.5 MB so the demo world still fits in localStorage.
   */
  async uploadFile<C extends FileCollection>(
    collection: C,
    id: string,
    field: FileFieldOf<C>,
    file: Blob,
    name?: string,
  ): Promise<RecordOf<C>> {
    assertFileField(collection, field);
    if (!this.table(collection).has(id)) {
      throw new StoreError('not_found', 'That record no longer exists.', 404);
    }
    const photo = await preparePhoto(file, {
      name,
      maxBytes: MEMORY_FILE_MAX_BYTES,
      codec: this.opts.imageCodec,
    });
    const dataUrl = await blobToDataUrl(photo.blob);
    return clone(this.updateNow(collection, id, { [field]: dataUrl })) as unknown as RecordOf<C>;
  }

  async removeFile<C extends FileCollection>(
    collection: C,
    id: string,
    field: FileFieldOf<C>,
  ): Promise<RecordOf<C>> {
    assertFileField(collection, field);
    return clone(this.updateNow(collection, id, { [field]: null })) as unknown as RecordOf<C>;
  }

  /** The data URL itself: demo mode keeps one size, so `thumb` changes nothing. */
  fileUrl<C extends FileCollection>(
    _collection: C,
    record: RecordOf<C>,
    field: FileFieldOf<C>,
    _options?: FileUrlOptions,
  ): string | null {
    const url = (record as unknown as Record<string, unknown>)[field];
    return typeof url === 'string' && url ? url : null;
  }

  /**
   * A write made through a public share link (share.pb.js): nobody is signed in for it, so
   * nothing is stamped from a user and the activity line has no actor and ends with
   * "(via share link, Sam)". Used by the demo-mode ShareApi (data/share.ts).
   */
  async updateViaShareLink<C extends CollectionName>(
    collection: C,
    id: string,
    patch: Patch<RecordOf<C>>,
    by: string,
  ): Promise<RecordOf<C>> {
    const userId = this.userId;
    this.userId = null;
    this.activitySuffix = ` (via share link${by ? `, ${by}` : ''})`;
    try {
      return clone(this.updateNow(collection, id, patch)) as unknown as RecordOf<C>;
    } finally {
      this.userId = userId;
      this.activitySuffix = '';
    }
  }

  private createNow(collection: CollectionName, data: object): AnyRecord {
    const table = this.table(collection);
    const input = clone(data) as Record<string, unknown>;
    const id = typeof input.id === 'string' && input.id ? input.id : newId();
    if (table.has(id)) throw new StoreError('unique', 'A record with that id already exists.');
    const now = this.now();
    const rec: AnyRecord = { ...stripUndefined(input), id, created: now, updated: now };
    this.stamp(collection, rec, 'create');
    this.syncEntry(collection, rec, null);
    this.syncServerOwned(collection, rec, null);
    this.checkUnique(collection, rec);
    table.set(id, rec);
    this.afterChange(collection, 'create', null, rec);
    return rec;
  }

  private updateNow(
    collection: CollectionName,
    id: string,
    patch: object,
    options?: UpdateOptions,
  ): AnyRecord {
    const table = this.table(collection);
    const prev = table.get(id);
    if (!prev) throw new StoreError('not_found', 'That record no longer exists.', 404);
    // concurrency.pb.js: only events and load placements honor expectedUpdated.
    if (
      options?.expectedUpdated &&
      isGuarded(collection) &&
      !sameStamp(options.expectedUpdated, prev.updated as string | undefined)
    ) {
      throw new StoreError('conflict', CONFLICT_MESSAGE, 409);
    }
    const changes = stripUndefined(clone(patch) as Record<string, unknown>);
    delete changes.id;
    delete changes.created;
    const next: AnyRecord = { ...prev, ...changes, id, updated: this.now() };
    this.stamp(collection, next, 'update');
    this.syncEntry(collection, next, prev);
    this.syncServerOwned(collection, next, prev);
    this.checkUnique(collection, next);
    table.set(id, next);
    this.afterChange(collection, 'update', prev, next);
    return next;
  }

  private deleteNow(collection: CollectionName, id: string) {
    const prev = this.table(collection).get(id);
    if (!prev) throw new StoreError('not_found', 'That record no longer exists.', 404);
    for (const [source, field, def] of INCOMING.get(collection) ?? []) {
      if (def.onDelete !== 'restrict') continue;
      const inUse = [...this.table(source).values()].some((r) => r[field] === id);
      if (inUse) {
        const noun = NOUNS[collection] ?? 'record';
        throw new StoreError(
          'in_use',
          `This ${noun} is still in use. Archive it instead, or remove what uses it first.`,
          400,
        );
      }
    }
    this.removeCascading(collection, id);
    this.afterChange(collection, 'delete', prev, null);
  }

  subscribe<C extends CollectionName>(collection: C, handler: ChangeHandler<C>): () => void {
    const set = this.listeners.get(collection) ?? new Set();
    set.add(handler as unknown as ChangeHandler);
    this.listeners.set(collection, set);
    return () => set.delete(handler as unknown as ChangeHandler);
  }

  async resetDemo(): Promise<void> {
    const world = this.opts.reseed?.();
    if (!world) return;
    this.load(world);
    if (this.userId && !this.table('users').has(this.userId)) this.setUser(null);
    this.cachedUserStale = true;
    this.save(true);
    this.notifyAuth();
  }

  // -------------------------------------------------------------------------
  // Server-hook emulation

  private stamp(collection: CollectionName, rec: AnyRecord, when: 'create' | 'update') {
    const fields = STAMPED[collection];
    if (!fields || !this.userId) return;
    for (const f of when === 'create' ? fields.onCreate : fields.onUpdate) rec[f] = this.userId;
  }

  /** entries.pb.js: boatClass is copied from the event on create and follows it on a move. */
  private syncEntry(collection: CollectionName, rec: AnyRecord, prev: AnyRecord | null) {
    if (collection !== 'entries') return;
    const eventId = rec.eventId as string | null | undefined;
    if (!eventId) return;
    if (prev && prev.eventId === eventId) return;
    const event = this.table('events').get(eventId);
    if (event?.boatClass) rec.boatClass = event.boatClass;
  }

  /**
   * Fields the server owns on share links and comments. share.pb.js: a new share link gets a token
   * (one passed in is kept, for tests; the server always makes its own), `createdBy`, and no
   * revocation; token, regatta, team, and creator never change; revoking stamps the time and
   * is permanent. stamp.pb.js and comments.pb.js: a comment's author is the signed-in user and
   * its `mentions` are resolved from the body on every write.
   */
  private syncServerOwned(collection: CollectionName, rec: AnyRecord, prev: AnyRecord | null) {
    if (collection === 'share_links') {
      if (!prev) {
        if (!rec.token) rec.token = newShareToken();
        rec.createdBy = this.userId ?? rec.createdBy ?? null;
        rec.revokedAt = null;
        return;
      }
      for (const k of ['token', 'regattaId', 'teamId', 'createdBy']) rec[k] = prev[k];
      if (prev.revokedAt && rec.revokedAt !== prev.revokedAt) {
        throw new StoreError(
          'validation',
          'A revoked link stays revoked. Create a new link instead.',
          400,
        );
      }
      if (!prev.revokedAt && rec.revokedAt) rec.revokedAt = this.now();
    }
    if (collection === 'comments') {
      if (!prev && this.userId) rec.authorId = this.userId;
      const users = [...this.table('users').values()] as unknown as MentionUser[];
      rec.mentions = parseMentions(String(rec.body ?? ''), users);
    }
  }

  private checkUnique(collection: CollectionName, rec: AnyRecord) {
    for (const fields of UNIQUE[collection] ?? []) {
      if (fields.some((f) => isEmpty(rec[f]))) continue;
      for (const other of this.table(collection).values()) {
        if (other.id === rec.id) continue;
        if (fields.every((f) => other[f] === rec[f])) {
          throw new StoreError('unique', 'That already exists.', 400);
        }
      }
    }
  }

  private removeCascading(collection: CollectionName, id: string) {
    const prev = this.table(collection).get(id);
    if (!prev) return;
    this.table(collection).delete(id);
    for (const [source, field, def] of INCOMING.get(collection) ?? []) {
      for (const rec of [...this.table(source).values()]) {
        if (def.multi) {
          const list = (rec[field] as string[] | undefined) ?? [];
          if (!list.includes(id)) continue;
          const next = { ...rec, [field]: list.filter((x) => x !== id), updated: this.now() };
          this.table(source).set(rec.id, next);
          this.emit({ action: 'update', collection: source, record: next });
        } else if (rec[field] === id) {
          if (def.onDelete === 'cascade') {
            this.removeCascading(source, rec.id);
            this.emit({ action: 'delete', collection: source, record: rec });
          } else if (def.onDelete === 'unset') {
            const next = { ...rec, [field]: null, updated: this.now() };
            this.table(source).set(rec.id, next);
            this.emit({ action: 'update', collection: source, record: next });
          }
        }
      }
    }
  }

  private afterChange(
    collection: CollectionName,
    action: 'create' | 'update' | 'delete',
    prev: AnyRecord | null,
    next: AnyRecord | null,
  ) {
    const record = (next ?? prev)!;
    this.emit({ action, collection, record });
    this.logActivity(collection, action, prev, next);
    if (collection === 'users' && record.id === this.userId) {
      this.cachedUserStale = true;
      this.notifyAuth();
    }
    this.save();
  }

  private logActivity(
    collection: CollectionName,
    action: 'create' | 'update' | 'delete',
    prev: AnyRecord | null,
    next: AnyRecord | null,
  ) {
    const lookup: Lookup = <C extends CollectionName>(c: C, id: string) =>
      this.table(c).get(id) as unknown as RecordOf<C> | undefined;
    const draft = describeChange(lookup, collection, action, prev, next);
    if (!draft) return;
    const now = this.now();
    const rec: AnyRecord = {
      id: newId(),
      created: now,
      updated: now,
      actorId: this.userId,
      ...draft,
      summary: draft.summary + this.activitySuffix,
    };
    this.table('activity_log').set(rec.id, rec);
    this.emit({ action: 'create', collection: 'activity_log', record: rec });
  }

  private emit(event: {
    action: ChangeEvent['action'];
    collection: CollectionName;
    record: AnyRecord;
  }) {
    const handlers = this.listeners.get(event.collection);
    if (!handlers || handlers.size === 0) return;
    const payload = { ...event, record: clone(event.record) } as unknown as ChangeEvent;
    // Asynchronous, like a server push: the caller sees the write resolve first.
    const fire = () =>
      setTimeout(() => {
        for (const h of handlers) h(payload);
      }, 0);
    if (this.held) this.held.push(fire);
    else fire();
  }

  // -------------------------------------------------------------------------
  // Auth: any seeded user, password ignored (demo and tests only).

  private createAuth(): AuthApi {
    const currentUser = () => this.currentUser();
    return {
      get user() {
        return currentUser();
      },
      signInWithPassword: async (email: string) => {
        const wanted = email.trim().toLowerCase();
        const user = [...this.table('users').values()].find(
          (u) => String(u.email).toLowerCase() === wanted,
        );
        if (!user) {
          throw new StoreError('auth', 'No account uses that email. Pick a demo account below.');
        }
        this.setUser(user.id);
        return currentUser()!;
      },
      signInWithGoogle: async () => {
        throw new StoreError(
          'auth',
          'Google sign-in needs the server. In demo mode, pick an account below.',
        );
      },
      signOut: () => this.setUser(null),
      onChange: (listener) => {
        this.authListeners.add(listener);
        return () => this.authListeners.delete(listener);
      },
      refresh: async () => currentUser(),
    };
  }

  private currentUser(): User | null {
    if (this.cachedUserStale) {
      const rec = this.userId ? this.table('users').get(this.userId) : undefined;
      this.cachedUser = rec ? (clone(rec) as unknown as User) : null;
      this.cachedUserStale = false;
    }
    return this.cachedUser;
  }

  private setUser(id: string | null) {
    this.userId = id;
    this.cachedUserStale = true;
    if (this.opts.authKey) {
      try {
        if (id) localStorage.setItem(this.opts.authKey, id);
        else localStorage.removeItem(this.opts.authKey);
      } catch {
        // Storage can be unavailable (private windows); the session then lasts one page load.
      }
    }
    this.notifyAuth();
  }

  private notifyAuth() {
    const user = this.currentUser();
    for (const l of this.authListeners) l(user);
  }

  private readAuth(): string | null {
    if (!this.opts.authKey) return null;
    try {
      return localStorage.getItem(this.opts.authKey);
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Storage

  private table(collection: CollectionName): Map<string, AnyRecord> {
    let t = this.tables.get(collection);
    if (!t) {
      t = new Map();
      this.tables.set(collection, t);
    }
    return t;
  }

  private load(world: World) {
    this.tables = new Map();
    for (const c of COLLECTION_NAMES) {
      const rows = (world[c] ?? []) as unknown as AnyRecord[];
      this.tables.set(c, new Map(rows.map((r) => [r.id, clone(r)])));
    }
  }

  private now(): string {
    return this.opts.now ? this.opts.now() : new Date().toISOString();
  }

  private save(immediate = false) {
    const key = this.opts.persistKey;
    if (!key) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const write = () => {
      this.saveTimer = null;
      const payload: Persisted = {
        version: 1,
        seedHash: this.opts.seedHash,
        savedAt: new Date().toISOString(),
        world: this.snapshot(),
      };
      try {
        localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        // Quota or privacy mode: demo changes last until the tab closes.
      }
    };
    if (immediate) write();
    else this.saveTimer = setTimeout(write, 150);
  }

  /** Write pending changes now (called on pagehide). */
  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.save(true);
    }
  }
}

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A share-link token like the server's: 40 characters from a 62-letter alphabet. */
function newShareToken(): string {
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  let out = '';
  // `b % 62` is slightly biased; that does not matter for demo-mode tokens.
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * Read a persisted demo world. Returns null when there is none, it is unreadable, or it was
 * saved from a different seed (so a new seed replaces stale demo data).
 */
export function readPersistedWorld(key: string, seedHash?: string): World | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.version !== 1 || !parsed.world) return null;
    if (seedHash && parsed.seedHash !== seedHash) return null;
    const world = parsed.world as Record<string, unknown[]>;
    for (const c of COLLECTION_NAMES) if (!Array.isArray(world[c])) world[c] = [];
    return world as unknown as World;
  } catch {
    return null;
  }
}
