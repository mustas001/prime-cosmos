/**
 * Bit helpers shared by the sieve worker and the main thread.
 *
 * Bit layout is little-endian within each byte: integer `n` lives in
 * byte `n >> 3`, bit `n & 7`. The same layout is uploaded to the GPU as an R8UI
 * texture later, so the vertex shader can test `(byte >> (i & 7u)) & 1u`.
 */

/** Population count for every byte value. */
export const POPCOUNT8: Uint8Array = (() => {
  const t = new Uint8Array(256);
  for (let i = 1; i < 256; i++) t[i] = t[i >> 1] + (i & 1);
  return t;
})();

/** True if bit `n` is set. Out-of-range reads are false. */
export function getBit(bits: Uint8Array, n: number): boolean {
  return ((bits[n >> 3] >> (n & 7)) & 1) === 1;
}

/** Number of set bits in the half-open bit range `[lo, hi)`, clamped to the array. */
export function countBits(bits: Uint8Array, lo: number, hi: number): number {
  lo = Math.max(0, lo);
  hi = Math.min(bits.length * 8, hi);
  if (lo >= hi) return 0;

  const first = lo >> 3;
  const last = (hi - 1) >> 3;
  const loMask = (0xff << (lo & 7)) & 0xff; // bits >= lo within the first byte
  const hiMask = 0xff >> (7 - ((hi - 1) & 7)); // bits <= hi-1 within the last byte

  if (first === last) return POPCOUNT8[bits[first] & loMask & hiMask];

  let count = POPCOUNT8[bits[first] & loMask] + POPCOUNT8[bits[last] & hiMask];
  for (let b = first + 1; b < last; b++) count += POPCOUNT8[bits[b]];
  return count;
}
