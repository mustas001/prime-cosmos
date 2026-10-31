import { POPCOUNT8 } from '../math/bitset';

/**
 * Bit-packed, odd-only, segmented Sieve of Eratosthenes.
 *
 * Two representations are used on purpose:
 *
 *  - Working buffer (cache-resident, odd-only): bit `k` stands for the odd number
 *    `2k + 1`. Even numbers are never stored, which halves both memory traffic and the
 *    number of strikes. The buffer is one segment (default 16 kB, fits in L1 next to the
 *    base-prime tables) and is reused for the whole run.
 *
 *  - Output (dense, one bit per integer): bit `n` is set iff `n` is prime. This is the
 *    layout every consumer wants (shader lookup, `isPrime`, range counts) with no
 *    parity special-casing. Each finished segment byte is widened to two output bytes
 *    with a 256-entry lookup table, so the conversion costs O(limit / 16).
 *
 * Output cost is `limit / 8` bytes: 1.25 MB for 10^7, 125 MB for 10^9.
 */

/** Hard cap so every index/product stays inside int32 arithmetic. */
export const MAX_LIMIT = 1_000_000_000;

/** Odd-only working segment size in bytes. One segment covers `segmentBytes * 16` integers. */
export const DEFAULT_SEGMENT_BYTES = 16 * 1024;

export interface SieveOptions {
  segmentBytes?: number;
  /** Called after every segment with a completed fraction in (0, 1]. */
  onProgress?: (fraction: number) => void;
}

export interface SieveOutput {
  limit: number;
  /** Bit `n` set ⇔ `n` is prime, for `0 ≤ n ≤ limit`. Bits above `limit` are zero. */
  bits: Uint8Array<ArrayBuffer>;
  /** π(limit) */
  primeCount: number;
}

/**
 * Bit q of an odd-only byte is the odd number 16B + 2q + 1 relative to its byte index B,
 * i.e. output bit (2q + 1) of the 16-bit pair. SPREAD_LO takes q = 0..3 (low output byte),
 * SPREAD_HI takes q = 4..7 (high output byte).
 */
const SPREAD_LO = new Uint8Array(256);
const SPREAD_HI = new Uint8Array(256);
for (let b = 0; b < 256; b++) {
  let lo = 0;
  let hi = 0;
  for (let q = 0; q < 4; q++) {
    lo |= ((b >> q) & 1) << (2 * q + 1);
    hi |= ((b >> (q + 4)) & 1) << (2 * q + 1);
  }
  SPREAD_LO[b] = lo;
  SPREAD_HI[b] = hi;
}

/** All odd primes ≤ `maxP`, via a plain odd-only sieve (tiny: maxP ≤ √limit ≈ 31 623). */
function oddBasePrimes(maxP: number): Int32Array {
  if (maxP < 3) return new Int32Array(0);

  const kMax = (maxP - 1) >> 1; // odd index of the largest odd ≤ maxP
  const composite = new Uint8Array(kMax + 1);
  for (let k = 1; (2 * k + 1) * (2 * k + 1) <= maxP; k++) {
    if (composite[k]) continue;
    const p = 2 * k + 1;
    for (let m = (p * p - 1) >> 1; m <= kMax; m += p) composite[m] = 1;
  }

  const primes: number[] = [];
  for (let k = 1; k <= kMax; k++) if (!composite[k]) primes.push(2 * k + 1);
  return Int32Array.from(primes);
}

/** ⌊√n⌋ without floating-point surprises near perfect squares. */
function isqrt(n: number): number {
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r--;
  while ((r + 1) * (r + 1) <= n) r++;
  return r;
}

export function sieveBits(limit: number, options: SieveOptions = {}): SieveOutput {
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_LIMIT) {
    throw new RangeError(`limit must be an integer in [0, ${MAX_LIMIT}], got ${limit}`);
  }
  const segmentBytes = options.segmentBytes ?? DEFAULT_SEGMENT_BYTES;
  if (!Number.isInteger(segmentBytes) || segmentBytes < 1) {
    throw new RangeError(`segmentBytes must be a positive integer, got ${segmentBytes}`);
  }

  if (limit < 2) return { limit, bits: new Uint8Array(1), primeCount: 0 };

  const oddCount = (limit + 1) >> 1; // odd numbers in [1, limit]
  const oddBytes = (oddCount + 7) >> 3;
  // Expansion writes 2 bytes per odd byte; make sure bit `limit` itself is addressable.
  const out = new Uint8Array(Math.max(2 * oddBytes, (limit >> 3) + 1));

  const base = oddBasePrimes(isqrt(limit));
  // Odd index of the next multiple to strike for each base prime; starts at p² (index (p²-1)/2).
  const next = new Int32Array(base.length);
  for (let i = 0; i < base.length; i++) next[i] = (base[i] * base[i] - 1) >> 1;

  const segmentBits = segmentBytes * 8;
  const segment = new Uint8Array(segmentBytes);
  let active = 0; // base primes are sorted, so those whose p² has been reached form a prefix

  for (let segLo = 0; segLo < oddCount; segLo += segmentBits) {
    const segHi = Math.min(segLo + segmentBits, oddCount);
    const span = segHi - segLo;

    segment.fill(0xff); // 1 = still a prime candidate
    if (segLo === 0) segment[0] &= ~1; // odd index 0 is the number 1

    while (active < base.length && next[active] < segHi) active++;
    for (let i = 0; i < active; i++) {
      const p = base[i];
      let j = next[i] - segLo; // stepping an odd index by p steps the number by 2p
      for (; j < span; j += p) segment[j >> 3] &= ~(1 << (j & 7));
      next[i] = segLo + j;
    }

    // segLo is a multiple of segmentBits, hence of 8: the byte offset is exact.
    const firstByte = segLo >> 3;
    const bytes = (span + 7) >> 3;
    for (let t = 0; t < bytes; t++) {
      const b = segment[t];
      const o = (firstByte + t) << 1;
      out[o] = SPREAD_LO[b];
      out[o + 1] = SPREAD_HI[b];
    }

    options.onProgress?.(segHi / oddCount);
  }

  out[0] |= 1 << 2; // the only even prime

  // The last odd byte can hold candidate bits past `limit` that were never fully sieved.
  for (let n = limit + 1; n < out.length * 8; n++) out[n >> 3] &= ~(1 << (n & 7));

  let primeCount = 0;
  for (let i = 0; i < out.length; i++) primeCount += POPCOUNT8[out[i]];

  return { limit, bits: out, primeCount };
}
