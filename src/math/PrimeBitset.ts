import { countBits, getBit } from './bitset';

/** Bytes per prefix-count block. 64 bytes = 512 integers, so a rank query popcounts ≤ 64 bytes. */
const BLOCK_BYTES = 64;
const BLOCK_BITS = BLOCK_BYTES * 8;

/** Immutable view over a sieve result: bit `n` is set iff `n` is prime. */
export class PrimeBitset {
  private prefix: Uint32Array | null = null;

  constructor(
    /** Largest integer covered (inclusive). */
    readonly limit: number,
    readonly bits: Uint8Array,
    /** π(limit) */
    readonly primeCount: number,
  ) {}

  isPrime(n: number): boolean {
    return Number.isInteger(n) && n >= 0 && n <= this.limit && getBit(this.bits, n);
  }

  /** Number of primes in the half-open range `[lo, hi)`. */
  countRange(lo: number, hi: number): number {
    const a = Math.max(0, Math.ceil(lo));
    const b = Math.min(this.limit + 1, Math.ceil(hi));
    return a >= b ? 0 : this.countBelow(b) - this.countBelow(a);
  }

  /** π(n): the number of primes ≤ n (clamped to the sieved range). */
  pi(n: number): number {
    return this.countBelow(Math.min(this.limit + 1, Math.max(0, Math.floor(n) + 1)));
  }

  /** Largest prime strictly below `n`, or 0 if there is none. */
  prevPrime(n: number): number {
    for (let m = Math.min(Math.floor(n) - 1, this.limit); m >= 2; m--) if (getBit(this.bits, m)) return m;
    return 0;
  }

  /** Smallest prime strictly above `n`, or 0 if none lies within the sieved range. */
  nextPrime(n: number): number {
    for (let m = Math.max(Math.floor(n) + 1, 2); m <= this.limit; m++) if (getBit(this.bits, m)) return m;
    return 0;
  }

  /** Primes in `[0, x)`; `x` must lie in `[0, limit + 1]`. */
  private countBelow(x: number): number {
    const prefix = (this.prefix ??= this.buildPrefix());
    const block = Math.floor(x / BLOCK_BITS);
    return prefix[block] + countBits(this.bits, block * BLOCK_BITS, x);
  }

  private buildPrefix(): Uint32Array {
    const blocks = Math.ceil(this.bits.length / BLOCK_BYTES) + 1;
    const prefix = new Uint32Array(blocks);
    for (let b = 1; b < blocks; b++) {
      const start = (b - 1) * BLOCK_BITS;
      prefix[b] = prefix[b - 1] + countBits(this.bits, start, start + BLOCK_BITS);
    }
    return prefix;
  }
}
