// PocketBaseStore: the DataStore over the PocketBase JS SDK. This is the only file in the app
// that imports the SDK. Field and value mapping lives in pb-mapper.ts; server-side behavior
// (stamping, activity log, entry sync) lives in pb_hooks.

import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase';
import type { CollectionName, User } from '@regatta-ops/domain';
import type { ImageCodec } from '../lib/image';
import { assertFileField, preparePhoto, SERVER_FILE_MAX_BYTES } from './files';
import { chunkQuery, fileNameFromUrl, fromPb, toPb, toPbField, toPbListParams } from './pb-mapper';
import {
  applyQuery,
  StoreError,
  type AuthApi,
  type BatchOp,
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

export interface PocketBaseStoreOptions {
  /** Decodes and re-encodes photos before upload; default: the browser's (none in Node). */
  imageCodec?: ImageCodec | null;
}

/** Most PocketBase batch requests are capped at 200 operations. */
const MAX_BATCH = 200;

function toStoreError(err: unknown, op: 'read' | 'write' = 'read'): StoreError {
  if (err instanceof StoreError) return err;
  if (err instanceof ClientResponseError) {
    const status = err.status;
    if (status === 0) {
      return new StoreError('network', 'Could not reach the server. Check your connection.', 0);
    }
    if (status === 404) {
      // PocketBase answers 404 when an update or delete rule fails, not 403.
      return new StoreError(
        'not_found',
        op === 'write'
          ? 'This change was not saved. The record is gone, or your role cannot edit it.'
          : 'That record no longer exists.',
        404,
      );
    }
    if (status === 409) {
      return new StoreError(
        'conflict',
        'Someone else changed this first. The latest version is showing now; make your change again.',
        409,
      );
    }
    if (status === 403) {
      return new StoreError('forbidden', 'Your role cannot make this change.', 403);
    }
    if (status === 401) return new StoreError('auth', 'Sign in to continue.', 401);
    if (status === 400) {
      const data = (err.response?.data ?? {}) as Record<
        string,
        { code?: string; message?: string }
      >;
      const unique = Object.values(data).some((d) => d?.code === 'validation_not_unique');
      if (unique) return new StoreError('unique', 'That already exists.', 400);
      const first = Object.values(data)[0]?.message;
      return new StoreError('validation', first ?? err.message, 400);
    }
    return new StoreError('unknown', err.message, status);
  }
  return new StoreError('unknown', err instanceof Error ? err.message : String(err));
}

export class PocketBaseStore implements DataStore {
  readonly mode = 'pocketbase' as const;
  readonly pb: PocketBase;
  readonly auth: AuthApi;
  private readonly imageCodec: ImageCodec | null | undefined;

  constructor(baseUrl = '/', options: PocketBaseStoreOptions = {}) {
    this.imageCodec = options.imageCodec;
    this.pb = new PocketBase(baseUrl);
    // Several components may list the same collection at once; PocketBase's default
    // auto-cancellation would abort all but the last of them.
    this.pb.autoCancellation(false);
    this.auth = this.createAuth();
  }

  private map<C extends CollectionName>(collection: C, raw: RecordModel): RecordOf<C> {
    const rec = fromPb<Record<string, unknown>>(collection, raw);
    if (collection === 'users') {
      rec.avatarUrl = raw.avatar ? this.pb.files.getURL(raw, String(raw.avatar)) : null;
      if (rec.preferences == null) rec.preferences = {};
    }
    if (collection === 'shells') {
      rec.photoUrl = raw.photo ? this.pb.files.getURL(raw, String(raw.photo)) : null;
    }
    return rec as unknown as RecordOf<C>;
  }

  async list<C extends CollectionName>(
    collection: C,
    query?: ListQuery<RecordOf<C>>,
  ): Promise<RecordOf<C>[]> {
    try {
      const chunks = chunkQuery(query);
      const limit = query?.limit;
      const results: RecordOf<C>[] = [];
      for (const chunk of chunks) {
        const params = toPbListParams(collection, chunk);
        if (!params) continue;
        const options = {
          ...(params.filter ? { filter: this.pb.filter(params.filter, params.params) } : {}),
          ...(params.sort ? { sort: params.sort } : {}),
        };
        const raw =
          limit != null
            ? (
                await this.pb
                  .collection(collection)
                  .getList(1, Math.max(1, limit), { ...options, skipTotal: true })
              ).items
            : await this.pb.collection(collection).getFullList({ batch: 500, ...options });
        for (const r of raw) results.push(this.map(collection, r));
      }
      // Chunked results arrive per chunk; restore the requested order (and limit) across chunks.
      return chunks.length > 1 ? applyQuery(results, { sort: query?.sort, limit }) : results;
    } catch (err) {
      throw toStoreError(err);
    }
  }

  async get<C extends CollectionName>(collection: C, id: string): Promise<RecordOf<C> | null> {
    try {
      return this.map(collection, await this.pb.collection(collection).getOne(id));
    } catch (err) {
      const e = toStoreError(err);
      if (e.code === 'not_found') return null;
      throw e;
    }
  }

  async create<C extends CollectionName>(
    collection: C,
    data: CreateInput<RecordOf<C>>,
  ): Promise<RecordOf<C>> {
    try {
      const body = toPb(collection, data as Record<string, unknown>);
      return this.map(collection, await this.pb.collection(collection).create(body));
    } catch (err) {
      throw toStoreError(err, 'write');
    }
  }

  async update<C extends CollectionName>(
    collection: C,
    id: string,
    patch: Patch<RecordOf<C>>,
    options?: UpdateOptions,
  ): Promise<RecordOf<C>> {
    try {
      const body = toPb(collection, patch as Record<string, unknown>);
      // concurrency.pb.js answers 409 when this no longer matches the stored `updated`.
      if (options?.expectedUpdated) body.expected_updated = options.expectedUpdated;
      return this.map(collection, await this.pb.collection(collection).update(id, body));
    } catch (err) {
      throw toStoreError(err, 'write');
    }
  }

  async delete<C extends CollectionName>(collection: C, id: string): Promise<void> {
    try {
      await this.pb.collection(collection).delete(id);
    } catch (err) {
      throw toStoreError(err, 'write');
    }
  }

  async batch(ops: BatchOp[]): Promise<(RecordOf<CollectionName> | null)[]> {
    if (ops.length === 0) return [];
    if (ops.length > MAX_BATCH) {
      throw new StoreError(
        'validation',
        `Too many changes at once (${ops.length}; the limit is ${MAX_BATCH}).`,
      );
    }
    try {
      const batch = this.pb.createBatch();
      for (const op of ops) {
        const target = batch.collection(op.collection);
        if (op.op === 'create')
          target.create(toPb(op.collection, op.data as Record<string, unknown>));
        else if (op.op === 'update') {
          target.update(op.id, toPb(op.collection, op.patch as Record<string, unknown>));
        } else target.delete(op.id);
      }
      const results = await batch.send();
      return results.map((r, i) => {
        const op = ops[i]!;
        return op.op === 'delete' ? null : this.map(op.collection, r.body as RecordModel);
      });
    } catch (err) {
      throw toStoreError(err, 'write');
    }
  }

  async uploadFile<C extends FileCollection>(
    collection: C,
    id: string,
    field: FileFieldOf<C>,
    file: Blob,
    name?: string,
  ): Promise<RecordOf<C>> {
    assertFileField(collection, field);
    const photo = await preparePhoto(file, {
      name,
      maxBytes: SERVER_FILE_MAX_BYTES,
      codec: this.imageCodec,
    });
    try {
      // The SDK sends a body holding a File as multipart form data.
      const body = {
        [toPbField(collection, field)]: new File([photo.blob], photo.name, {
          type: photo.blob.type,
        }),
      };
      return this.map(collection, await this.pb.collection(collection).update(id, body));
    } catch (err) {
      throw toStoreError(err, 'write');
    }
  }

  async removeFile<C extends FileCollection>(
    collection: C,
    id: string,
    field: FileFieldOf<C>,
  ): Promise<RecordOf<C>> {
    assertFileField(collection, field);
    try {
      const body = { [toPbField(collection, field)]: null };
      return this.map(collection, await this.pb.collection(collection).update(id, body));
    } catch (err) {
      throw toStoreError(err, 'write');
    }
  }

  fileUrl<C extends FileCollection>(
    collection: C,
    record: RecordOf<C>,
    field: FileFieldOf<C>,
    options: FileUrlOptions = {},
  ): string | null {
    const url = (record as unknown as Record<string, unknown>)[field];
    if (typeof url !== 'string' || !url) return null;
    const fileName = fileNameFromUrl(url);
    // The full file is the URL mapped on read; anything else (a preview) is used as it is.
    if (!options.thumb || !fileName) return url;
    return this.pb.files.getURL({ id: record.id, collectionName: collection }, fileName, {
      thumb: options.thumb,
    });
  }

  subscribe<C extends CollectionName>(collection: C, handler: ChangeHandler<C>): () => void {
    let unsubscribe: (() => Promise<void>) | null = null;
    let cancelled = false;
    this.pb
      .collection(collection)
      .subscribe('*', (e) => {
        handler({
          action: e.action as 'create' | 'update' | 'delete',
          collection,
          record: this.map(collection, e.record),
        });
      })
      .then((fn) => {
        if (cancelled) void fn();
        else unsubscribe = fn;
      })
      .catch(() => {
        // Realtime needs a signed-in user; the RealtimeProvider subscribes again on sign-in.
      });
    return () => {
      cancelled = true;
      if (unsubscribe) void unsubscribe().catch(() => {});
    };
  }

  private createAuth(): AuthApi {
    const pb = this.pb;
    // `user` must return the same object until the session changes (useSyncExternalStore). In
    // the browser, LocalAuthStore parses its local storage entry on every read, so
    // `authStore.record` is a new object each time: compare what it says, not its identity.
    let cachedFor: string | null = null;
    let cached: User | null = null;
    const currentUser = (): User | null => {
      const rec: RecordModel | null = pb.authStore.record;
      if (!pb.authStore.isValid || !rec || rec.collectionName !== 'users') {
        cachedFor = null;
        cached = null;
        return null;
      }
      const key = JSON.stringify(rec);
      if (key !== cachedFor) {
        cachedFor = key;
        cached = this.map('users', rec);
      }
      return cached;
    };
    return {
      get user() {
        return currentUser();
      },
      signInWithPassword: async (email, password) => {
        try {
          await pb.collection('users').authWithPassword(email, password);
        } catch (err) {
          const e = toStoreError(err);
          if (e.status === 400) {
            throw new StoreError('auth', 'Email or password is incorrect.', 400);
          }
          throw e;
        }
        const user = currentUser();
        if (!user) throw new StoreError('auth', 'Sign-in did not return a user.');
        return user;
      },
      signInWithGoogle: async () => {
        try {
          await pb.collection('users').authWithOAuth2({ provider: 'google' });
        } catch (err) {
          const e = toStoreError(err);
          if (e.status === 400 || e.status === 404) {
            throw new StoreError(
              'auth',
              'Google sign-in did not work. Use a club Google account, or sign in with email and password.',
              e.status,
            );
          }
          throw e;
        }
        const user = currentUser();
        if (!user) throw new StoreError('auth', 'Sign-in did not return a user.');
        return user;
      },
      signOut: () => {
        pb.authStore.clear();
        void pb.realtime.unsubscribe().catch(() => {});
      },
      onChange: (listener) => pb.authStore.onChange(() => listener(currentUser())),
      refresh: async () => {
        if (!pb.authStore.isValid) return null;
        try {
          await pb.collection('users').authRefresh();
        } catch (err) {
          const e = toStoreError(err);
          if (e.code !== 'network') pb.authStore.clear();
        }
        return currentUser();
      },
    };
  }
}
