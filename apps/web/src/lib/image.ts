// Client-side photo downscaling (PLAN.md §4.7): a phone photo is 3 to 12 MB and 4000 px wide;
// a shell photo needs about 1600 px. The decode and encode steps sit behind `ImageCodec` so the
// size logic is tested without a canvas (jsdom has none); the browser codec uses
// createImageBitmap and a canvas.

/** Formats kept as they are when they are already small enough. */
export const WEB_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const DEFAULT_MAX_EDGE = 1600;

export interface DecodedImage {
  width: number;
  height: number;
  /** What the codec draws from (an ImageBitmap in the browser). */
  source: unknown;
  /** Free the decoded pixels. */
  close?: () => void;
}

export interface ImageCodec {
  decode(blob: Blob): Promise<DecodedImage>;
  /** Draw the image at this size and encode it; JPEG takes a quality from 0 to 1. */
  encode(image: DecodedImage, width: number, height: number, quality: number): Promise<Blob>;
}

export type ImageErrorCode = 'unreadable' | 'too_large';

export class ImageError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode, message: string) {
    super(message);
    this.name = 'ImageError';
    this.code = code;
  }
}

/** The size that fits within `maxEdge` on the long side, keeping the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge || long <= 0) return { width, height };
  const k = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
}

export interface ShrinkOptions {
  /** Longest side in px after shrinking. Default 1600. */
  maxEdge?: number;
  /** Largest acceptable result in bytes. */
  maxBytes: number;
}

/** JPEG qualities tried in turn before the image is made smaller again. */
const QUALITIES = [0.85, 0.75, 0.65, 0.55];
/** Each further round shrinks the long side by this much... */
const STEP = 0.75;
/** ...down to this; a photo that still does not fit is refused. */
const MIN_EDGE = 480;

/**
 * The photo at most `maxEdge` px on its long side and at most `maxBytes`, as JPEG when it had to
 * be re-encoded. A JPEG, PNG, or WebP that already fits comes back untouched. Throws ImageError
 * 'unreadable' when the codec cannot decode it and 'too_large' when no size fits.
 */
export async function shrinkImage(
  blob: Blob,
  { maxEdge = DEFAULT_MAX_EDGE, maxBytes }: ShrinkOptions,
  codec: ImageCodec,
): Promise<Blob> {
  let image: DecodedImage;
  try {
    image = await codec.decode(blob);
  } catch {
    throw new ImageError(
      'unreadable',
      'This photo could not be read. Pick a JPEG, PNG, or WebP photo.',
    );
  }
  try {
    const target = fitWithin(image.width, image.height, maxEdge);
    const unchanged = target.width === image.width && target.height === image.height;
    if (unchanged && blob.size <= maxBytes && isWebImage(blob.type)) return blob;
    let size = target;
    let qualities = QUALITIES;
    for (;;) {
      for (const q of qualities) {
        const out = await codec.encode(image, size.width, size.height, q);
        if (out.size <= maxBytes) return out;
      }
      const long = Math.max(size.width, size.height);
      if (long * STEP < MIN_EDGE) break;
      size = fitWithin(size.width, size.height, Math.round(long * STEP));
      // Smaller pictures start one step lower; the top quality already failed above.
      qualities = QUALITIES.slice(1);
    }
    throw new ImageError('too_large', 'This photo is too large to keep. Pick a smaller one.');
  } finally {
    image.close?.();
  }
}

export function isWebImage(type: string): boolean {
  return (WEB_IMAGE_TYPES as readonly string[]).includes(type);
}

// The browser APIs used below, typed here so this module also compiles and loads without the
// DOM library (the backend's tests import PocketBaseStore, which imports this file).
interface BitmapLike {
  width: number;
  height: number;
  close(): void;
}
interface Context2DLike {
  fillStyle: string;
  imageSmoothingQuality: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
}
interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): Context2DLike | null;
  toBlob(done: (blob: Blob | null) => void, type: string, quality: number): void;
}
interface BrowserGlobals {
  createImageBitmap?: (blob: Blob, options?: { imageOrientation?: string }) => Promise<BitmapLike>;
  document?: { createElement(tag: 'canvas'): CanvasLike };
}

/**
 * The browser's codec: createImageBitmap (honoring EXIF rotation) and a canvas. Null where
 * there is none (Node, jsdom), so callers can store the file as it is.
 */
export function browserImageCodec(): ImageCodec | null {
  const env = globalThis as unknown as BrowserGlobals;
  const { createImageBitmap, document } = env;
  if (typeof createImageBitmap !== 'function' || !document) return null;
  return {
    async decode(blob) {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close(),
      };
    },
    async encode(image, width, height, quality) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D canvas.');
      // JPEG has no transparency: a transparent PNG gets a white background, not black.
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image.source, 0, 0, width, height);
      return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Encoding failed.'))),
          'image/jpeg',
          quality,
        ),
      );
    },
  };
}

/** A data URL for a blob ("data:image/jpeg;base64,..."). */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // In slices: spreading a whole photo into fromCharCode overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}
