// File fields (PLAN.md §4.7, §8.1): what both stores do to a photo before storing it, and the
// words for what can go wrong. PocketBase keeps the file and serves it (with thumbnails);
// MemoryStore keeps it in the record as a data URL, so it must stay small (demo mode saves the
// whole world in localStorage).

import {
  browserImageCodec,
  DEFAULT_MAX_EDGE,
  ImageError,
  shrinkImage,
  type ImageCodec,
} from '../lib/image';
import { StoreError, type FileCollection, type FileFieldOf } from './store';

/** Collections with a file field, and the domain field holding each file's URL. */
export const FILE_FIELDS: { readonly [C in FileCollection]: readonly FileFieldOf<C>[] } = {
  users: ['avatarUrl'],
  shells: ['photoUrl'],
};

/** Image types a file field accepts (the migration's list; HEIC is converted on the way in). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** The server's limit per file (pb_migrations: shells.photo maxSize). */
export const SERVER_FILE_MAX_BYTES = 10 * 1024 * 1024;
/** MemoryStore's limit per file, after downscaling: about 2 MB once base64-encoded. */
export const MEMORY_FILE_MAX_BYTES = 1.5 * 1024 * 1024;

export const NOT_A_PHOTO = 'Pick a photo: a JPEG, PNG, or WebP file.';

export function isFileField(collection: string, field: string): boolean {
  const fields = (FILE_FIELDS as Record<string, readonly string[]>)[collection];
  return !!fields && fields.includes(field);
}

export function assertFileField(collection: string, field: string): void {
  if (!isFileField(collection, field)) {
    throw new StoreError('validation', `${collection}.${field} is not a file field.`);
  }
}

const PHOTO_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

/** Whether a file looks like a photo by its type (or, lacking one, its name). */
export function looksLikePhoto(type: string, name?: string): boolean {
  if (type) return PHOTO_TYPES.includes(type.toLowerCase());
  return PHOTO_NAME.test(name ?? '');
}

/** The type of a file that came without one, from its name. */
function typeFromName(name: string | undefined): string {
  const ext = (name ?? '').match(PHOTO_NAME)?.[1]?.toLowerCase();
  if (!ext) return '';
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/**
 * The file name to store: the original name's stem (or "photo") with the extension of the
 * type actually stored, since a downscaled photo is a JPEG whatever it started as.
 */
export function uploadName(original: string | undefined, type: string): string {
  const stem =
    (original ?? '')
      .replace(/\.[a-z0-9]{1,5}$/i, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 60) || 'photo';
  const ext = EXTENSIONS[type.toLowerCase()];
  return ext ? `${stem}.${ext}` : stem;
}

export interface PreparedPhoto {
  blob: Blob;
  name: string;
}

/**
 * Check and downscale a photo for storage: at most 1600 px on the long side and `maxBytes`.
 * Without a codec (Node, jsdom) the file is kept as it is if it is small enough. Throws a
 * StoreError ('validation') with a sentence for the toast.
 */
export async function preparePhoto(
  file: Blob,
  opts: { name?: string; maxBytes: number; codec?: ImageCodec | null },
): Promise<PreparedPhoto> {
  const original = opts.name ?? (file as Blob & { name?: string }).name;
  if (!looksLikePhoto(file.type, original)) throw new StoreError('validation', NOT_A_PHOTO);
  const codec = opts.codec === undefined ? browserImageCodec() : opts.codec;
  let blob = file;
  if (codec) {
    try {
      blob = await shrinkImage(file, { maxEdge: DEFAULT_MAX_EDGE, maxBytes: opts.maxBytes }, codec);
    } catch (err) {
      if (err instanceof ImageError) throw new StoreError('validation', err.message);
      throw err;
    }
  } else if (file.size > opts.maxBytes) {
    throw new StoreError('validation', 'This photo is too large to keep. Pick a smaller one.');
  }
  const type = blob.type || typeFromName(original);
  return { blob, name: uploadName(original, type) };
}
