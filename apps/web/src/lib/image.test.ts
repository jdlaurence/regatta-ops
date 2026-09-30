import { describe, expect, it, vi } from 'vitest';
import { fitWithin, ImageError, shrinkImage, type DecodedImage, type ImageCodec } from './image';

/**
 * A codec without pixels: decode reports the size it was told, encode makes a blob whose byte
 * count follows width × height × quality (about what JPEG does).
 */
function fakeCodec(
  width: number,
  height: number,
  bytesPerPixel = 0.5,
): ImageCodec & { calls: [number, number, number][]; closed: number } {
  const calls: [number, number, number][] = [];
  const codec = {
    calls,
    closed: 0,
    async decode(): Promise<DecodedImage> {
      return { width, height, source: null, close: () => void codec.closed++ };
    },
    async encode(_img: DecodedImage, w: number, h: number, q: number) {
      calls.push([w, h, q]);
      return new Blob([new Uint8Array(Math.round(w * h * q * bytesPerPixel))], {
        type: 'image/jpeg',
      });
    },
  };
  return codec;
}

const blobOf = (bytes: number, type = 'image/jpeg') => new Blob([new Uint8Array(bytes)], { type });

describe('fitWithin', () => {
  it('scales the long side down and keeps the ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(4032, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });

  it('leaves images that already fit alone', () => {
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
    expect(fitWithin(640, 480, 1600)).toEqual({ width: 640, height: 480 });
  });
});

describe('shrinkImage', () => {
  it('returns a small web image untouched', async () => {
    const codec = fakeCodec(1200, 800);
    const input = blobOf(200_000, 'image/png');
    expect(await shrinkImage(input, { maxBytes: 1_000_000 }, codec)).toBe(input);
    expect(codec.calls).toEqual([]);
    expect(codec.closed).toBe(1);
  });

  it('downscales a large photo to 1600 px as JPEG', async () => {
    const codec = fakeCodec(4032, 3024);
    const out = await shrinkImage(blobOf(5_000_000), { maxBytes: 1_500_000 }, codec);
    expect(out.type).toBe('image/jpeg');
    expect(codec.calls[0]).toEqual([1600, 1200, 0.85]);
    expect(out.size).toBeLessThanOrEqual(1_500_000);
  });

  it('re-encodes an image that fits in pixels but not in bytes, and non-web types', async () => {
    const png = fakeCodec(1500, 1000);
    const out = await shrinkImage(blobOf(3_000_000, 'image/png'), { maxBytes: 1_000_000 }, png);
    expect(png.calls[0]).toEqual([1500, 1000, 0.85]);
    expect(out.type).toBe('image/jpeg');

    const heic = fakeCodec(800, 600);
    await shrinkImage(blobOf(100_000, 'image/heic'), { maxBytes: 1_000_000 }, heic);
    expect(heic.calls).toEqual([[800, 600, 0.85]]);
  });

  it('lowers the quality, then the size, until the photo fits', async () => {
    // 1600 × 1200 × q × 1 byte: 0.55 still gives 1.06 MB, so the size must drop too.
    const codec = fakeCodec(4000, 3000, 1);
    const out = await shrinkImage(blobOf(8_000_000), { maxBytes: 1_000_000 }, codec);
    expect(codec.calls.slice(0, 4).map((c) => c[2])).toEqual([0.85, 0.75, 0.65, 0.55]);
    expect(codec.calls[4]).toEqual([1200, 900, 0.75]);
    expect(out.size).toBeLessThanOrEqual(1_000_000);
  });

  it('refuses a photo no size fits, and one it cannot read', async () => {
    const codec = fakeCodec(4000, 3000, 100);
    const err = await shrinkImage(blobOf(8_000_000), { maxBytes: 1_000 }, codec).catch((e) => e);
    expect(err).toBeInstanceOf(ImageError);
    expect(err).toMatchObject({ code: 'too_large' });
    expect(codec.closed).toBe(1);

    const broken: ImageCodec = {
      decode: vi.fn().mockRejectedValue(new Error('bad data')),
      encode: vi.fn(),
    };
    await expect(shrinkImage(blobOf(10), { maxBytes: 1_000 }, broken)).rejects.toMatchObject({
      code: 'unreadable',
      message: 'This photo could not be read. Pick a JPEG, PNG, or WebP photo.',
    });
  });
});
