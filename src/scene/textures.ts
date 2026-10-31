import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RedIntegerFormat,
  UnsignedByteType,
} from 'three';
import { BITS_ROW_WIDTH } from '../topology/constants';
import type { PrimeBitset } from '../math/PrimeBitset';

/**
 * The sieve's bitmask as an R8UI texture, BITS_ROW_WIDTH bytes per row. The vertex shader
 * does one texelFetch per integer; consecutive integers hit consecutive texels, so the
 * fetches are cache-friendly even for 10^7 points.
 */
export function createPrimeTexture(primes: PrimeBitset): DataTexture {
  const rows = Math.ceil(primes.bits.length / BITS_ROW_WIDTH);
  const data = new Uint8Array(BITS_ROW_WIDTH * rows);
  data.set(primes.bits);

  const texture = new DataTexture(data, BITS_ROW_WIDTH, rows, RedIntegerFormat, UnsignedByteType);
  texture.internalFormat = 'R8UI';
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** Glyph cell in the atlas. Aspect (w/h) must match GLYPH_ASPECT in points.frag.glsl. */
const CELL_W = 64;
const CELL_H = 112;

/** Digits 0–9 side by side, white on black, mip-mapped for crisp text at any dot size. */
export function createGlyphAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * 10;
  canvas.height = CELL_H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${Math.round(CELL_H * 0.88 / 0.72)}px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace`;

  for (let d = 0; d < 10; d++) {
    const glyph = String(d);
    const width = ctx.measureText(glyph).width;
    const squeeze = Math.min(1, (CELL_W * 0.86) / width);
    ctx.save();
    ctx.translate(d * CELL_W + CELL_W / 2, CELL_H * 0.94);
    ctx.scale(squeeze, 1);
    ctx.fillText(glyph, 0, 0);
    ctx.restore();
  }

  const texture = new CanvasTexture(canvas);
  texture.flipY = false; // v = 0 is the top of the canvas
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
