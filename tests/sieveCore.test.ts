import { describe, expect, it } from 'vitest';
import { countBits, getBit } from '../src/math/bitset';
import { PrimeBitset } from '../src/math/PrimeBitset';
import { MAX_LIMIT, sieveBits } from '../src/workers/sieveCore';

/** Obviously-correct byte-per-integer sieve used as the oracle. */
function referencePrimes(limit: number): boolean[] {
  const isPrime = new Array<boolean>(limit + 1).fill(true);
  isPrime[0] = false;
  if (limit >= 1) isPrime[1] = false;
  for (let p = 2; p * p <= limit; p++) {
    if (!isPrime[p]) continue;
    for (let m = p * p; m <= limit; m += p) isPrime[m] = false;
  }
  return isPrime;
}

describe('sieveBits', () => {
  // OEIS A006880: π(10^k)
  const PI_OF_POWERS_OF_TEN: Array<[number, number]> = [
    [1, 4],
    [2, 25],
    [3, 168],
    [4, 1229],
    [5, 9592],
    [6, 78498],
    [7, 664579],
    [8, 5761455],
  ];

  it.each(PI_OF_POWERS_OF_TEN)('π(10^%i) = %i', (k, expected) => {
    expect(sieveBits(10 ** k).primeCount).toBe(expected);
  });

  it('matches the reference sieve bit-for-bit across segment sizes and limits', () => {
    // Tiny segments (1 byte = 8 odd numbers) force many segment boundaries.
    for (const segmentBytes of [1, 2, 3, 7, 64, 16 * 1024]) {
      for (const limit of [...Array.from({ length: 130 }, (_, i) => i), 255, 256, 1000, 4097, 65535, 100_000]) {
        const { bits, primeCount } = sieveBits(limit, { segmentBytes });
        const ref = referencePrimes(limit);
        let refCount = 0;
        for (let n = 0; n <= limit; n++) {
          if (getBit(bits, n) !== ref[n]) {
            throw new Error(`limit=${limit} segmentBytes=${segmentBytes}: mismatch at n=${n}`);
          }
          if (ref[n]) refCount++;
        }
        expect(primeCount).toBe(refCount);
      }
    }
  });

  it('never sets bits above the limit', () => {
    for (const limit of [2, 3, 15, 16, 17, 31, 100, 997, 10_000]) {
      const { bits } = sieveBits(limit);
      for (let n = limit + 1; n < bits.length * 8; n++) expect(getBit(bits, n)).toBe(false);
    }
  });

  it('handles degenerate limits', () => {
    expect(sieveBits(0).primeCount).toBe(0);
    expect(sieveBits(1).primeCount).toBe(0);
    expect(sieveBits(2).primeCount).toBe(1);
    expect(sieveBits(3).primeCount).toBe(2);
  });

  it('rejects invalid input', () => {
    for (const bad of [-1, 1.5, NaN, Infinity, MAX_LIMIT + 1]) {
      expect(() => sieveBits(bad)).toThrow(RangeError);
    }
    expect(() => sieveBits(100, { segmentBytes: 0 })).toThrow(RangeError);
  });

  it('reports monotonic progress ending at 1', () => {
    const seen: number[] = [];
    sieveBits(1_000_000, { segmentBytes: 1024, onProgress: (f) => seen.push(f) });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });
});

describe('PrimeBitset', () => {
  const limit = 5000;
  const { bits, primeCount } = sieveBits(limit);
  const primes = new PrimeBitset(limit, bits, primeCount);
  const ref = referencePrimes(limit);

  it('isPrime agrees with the reference and is false out of range', () => {
    for (let n = 0; n <= limit; n++) expect(primes.isPrime(n)).toBe(ref[n]);
    expect(primes.isPrime(-1)).toBe(false);
    expect(primes.isPrime(limit + 1)).toBe(false);
    expect(primes.isPrime(7.5)).toBe(false);
  });

  it('countRange counts primes in [lo, hi)', () => {
    const naive = (lo: number, hi: number) => {
      let c = 0;
      for (let n = Math.max(0, lo); n < Math.min(hi, limit + 1); n++) if (ref[n]) c++;
      return c;
    };
    for (const [lo, hi] of [[0, 10], [0, 1], [2, 3], [3, 3], [5, 4], [7, 8], [1, 100], [97, 101], [0, limit + 1], [-50, 20], [4990, 9999], [123, 4321]]) {
      expect(primes.countRange(lo, hi)).toBe(naive(lo, hi));
    }
    expect(primes.countRange(0, limit + 1)).toBe(primeCount);
  });

  it('countBits handles ranges inside a single byte', () => {
    const b = Uint8Array.of(0b1011_0110);
    expect(countBits(b, 0, 8)).toBe(5);
    expect(countBits(b, 1, 3)).toBe(2);
    expect(countBits(b, 3, 4)).toBe(0);
    expect(countBits(b, 4, 5)).toBe(1);
  });
});
