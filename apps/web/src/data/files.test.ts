import { describe, expect, it } from 'vitest';
import type { DecodedImage, ImageCodec } from '@/lib/image';
import { fixtureStore, flush, IDS } from '@/test/fixtures';
import {
  isFileField,
  looksLikePhoto,
  MEMORY_FILE_MAX_BYTES,
  preparePhoto,
  uploadName,
} from './files';
import { fileNameFromUrl, toPb } from './pb-mapper';
import { PocketBaseStore } from './pocketbase-store';
import { MemoryStore } from './memory-store';
import { fixtureWorld } from '@/test/fixtures';
import { StoreError, type ChangeEvent } from './store';

/** 1 × 1 transparent PNG. */
const PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);
const png = (name = 'peggy.png') => new File([PNG_BYTES], name, { type: 'image/png' });

/** Pretends every photo is 4000 × 3000 and encodes to a 1 KB JPEG. */
const bigPhotoCodec: ImageCodec & { sizes: [number, number][] } = {
  sizes: [],
  async decode(): Promise<DecodedImage> {
    return { width: 4000, height: 3000, source: null };
  },
  async encode(_i, w, h) {
    bigPhotoCodec.sizes.push([w, h]);
    return new Blob([new Uint8Array(1024)], { type: 'image/jpeg' });
  },
};

describe('file helpers', () => {
  it('knows the file fields', () => {
    expect(isFileField('shells', 'photoUrl')).toBe(true);
    expect(isFileField('users', 'avatarUrl')).toBe(true);
    expect(isFileField('shells', 'notes')).toBe(false);
    expect(isFileField('entries', 'photoUrl')).toBe(false);
  });

  it('tells photos from other files by type, or by name when there is no type', () => {
    expect(looksLikePhoto('image/jpeg')).toBe(true);
    expect(looksLikePhoto('image/HEIC')).toBe(true);
    expect(looksLikePhoto('application/pdf', 'peggy.jpg')).toBe(false);
    expect(looksLikePhoto('', 'IMG_2041.JPG')).toBe(true);
    expect(looksLikePhoto('', 'notes.txt')).toBe(false);
    expect(looksLikePhoto('image/gif')).toBe(false);
  });

  it('names the stored file after the original, with the stored type', () => {
    expect(uploadName('IMG_2041.HEIC', 'image/jpeg')).toBe('IMG_2041.jpg');
    expect(uploadName('Peggy on the dock.png', 'image/png')).toBe('Peggy-on-the-dock.png');
    expect(uploadName(undefined, 'image/jpeg')).toBe('photo.jpg');
    expect(uploadName('...', 'image/webp')).toBe('photo.webp');
  });

  it('keeps a small photo as it is without a codec, and refuses a large one', async () => {
    const small = await preparePhoto(png(), { maxBytes: 1000, codec: null });
    expect(small.name).toBe('peggy.png');
    expect(small.blob.size).toBe(PNG_BYTES.length);
    await expect(preparePhoto(png(), { maxBytes: 10, codec: null })).rejects.toMatchObject({
      code: 'validation',
      message: 'This photo is too large to keep. Pick a smaller one.',
    });
  });

  it('downscales with a codec and refuses what is not a photo', async () => {
    const out = await preparePhoto(png('dock.png'), { maxBytes: 5000, codec: bigPhotoCodec });
    expect(bigPhotoCodec.sizes[0]).toEqual([1600, 1200]);
    expect(out).toMatchObject({ name: 'dock.jpg' });
    expect(out.blob.type).toBe('image/jpeg');

    const pdf = new File(['%PDF'], 'hull.pdf', { type: 'application/pdf' });
    const err = await preparePhoto(pdf, { maxBytes: 5000, codec: null }).catch((e) => e);
    expect(err).toBeInstanceOf(StoreError);
    expect(err.message).toBe('Pick a photo: a JPEG, PNG, or WebP file.');
  });
});

describe('MemoryStore files', () => {
  it('keeps an uploaded photo in the record as a data URL and logs the change', async () => {
    const store = fixtureStore();
    const events: ChangeEvent[] = [];
    store.subscribe('shells', (e) => events.push(e));
    const shell = await store.uploadFile('shells', IDS.shell, 'photoUrl', png());
    expect(shell.photoUrl).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(store.fileUrl('shells', shell, 'photoUrl')).toBe(shell.photoUrl);
    expect(store.fileUrl('shells', shell, 'photoUrl', { thumb: '96x96' })).toBe(shell.photoUrl);
    expect((await store.get('shells', IDS.shell))?.photoUrl).toBe(shell.photoUrl);

    await flush();
    expect(events.map((e) => e.action)).toEqual(['update']);
    const [log] = await store.list('activity_log', { where: { targetId: IDS.shell } });
    expect(log).toMatchObject({ summary: 'edited shell Spencer (photo)' });
    // The log says a file changed without copying the photo into it.
    expect(log!.diff).toEqual({ photoUrl: { from: null, to: 'file' } });

    const removed = await store.removeFile('shells', IDS.shell, 'photoUrl');
    expect(removed.photoUrl).toBeNull();
    expect(store.fileUrl('shells', removed, 'photoUrl')).toBeNull();
  });

  it('downscales through its codec and refuses what does not fit or does not exist', async () => {
    const store = new MemoryStore({ world: fixtureWorld(), imageCodec: bigPhotoCodec });
    const shell = await store.uploadFile('shells', IDS.shell2, 'photoUrl', png());
    expect(shell.photoUrl).toMatch(/^data:image\/jpeg;base64,/);

    const plain = fixtureStore();
    const huge = new File([new Uint8Array(MEMORY_FILE_MAX_BYTES + 1)], 'big.jpg', {
      type: 'image/jpeg',
    });
    await expect(plain.uploadFile('shells', IDS.shell, 'photoUrl', huge)).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(
      plain.uploadFile('shells', 'shellmissing001', 'photoUrl', png()),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      // A field that is not a file field is refused whatever the types say.
      plain.uploadFile('shells', IDS.shell, 'notes' as 'photoUrl', png()),
    ).rejects.toMatchObject({ code: 'validation' });
    expect((await plain.get('shells', IDS.shell))?.photoUrl).toBeUndefined();
  });
});

describe('PocketBase file URLs', () => {
  it('reads the stored file name from a file URL', () => {
    expect(fileNameFromUrl('http://127.0.0.1:8090/api/files/pbc_1/abc/peggy_x1y2z3.jpg')).toBe(
      'peggy_x1y2z3.jpg',
    );
    expect(fileNameFromUrl('/api/files/shells/abc/dock%20photo_k2.png?thumb=96x96')).toBe(
      'dock photo_k2.png',
    );
    expect(fileNameFromUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(fileNameFromUrl('')).toBeNull();
    expect(fileNameFromUrl(null)).toBeNull();
  });

  it('never writes the URL field back', () => {
    expect(toPb('shells', { photoUrl: 'x', name: 'Peggy' })).toEqual({ name: 'Peggy' });
  });

  it('builds thumbnail URLs with the SDK', () => {
    const store = new PocketBaseStore('http://127.0.0.1:8090');
    const shell = {
      ...fixtureWorld().shells[0]!,
      photoUrl: 'http://127.0.0.1:8090/api/files/pbc_2105/shellspencer001/spencer_a1b2c3.jpg',
    };
    expect(store.fileUrl('shells', shell, 'photoUrl')).toBe(shell.photoUrl);
    expect(store.fileUrl('shells', shell, 'photoUrl', { thumb: '96x96' })).toBe(
      'http://127.0.0.1:8090/api/files/shells/shellspencer001/spencer_a1b2c3.jpg?thumb=96x96',
    );
    expect(store.fileUrl('shells', { ...shell, photoUrl: null }, 'photoUrl')).toBeNull();
  });
});
