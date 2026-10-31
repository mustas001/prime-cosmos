import { Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { divisorCount, divisorSum, factorize, formatFactors } from '../src/math/factorize';
import { FAMILIES, isFamilyMember, isQuadraticValue, type FamilyId } from '../src/math/families';
import { eisensteinInfo, gaussianInfo } from '../src/math/fields';
import { PrimeBitset } from '../src/math/PrimeBitset';
import { packTurns } from '../src/scene/uniforms';
import { ulamCoord, hexCoord } from '../src/topology/topologies';
import { sieveBits } from '../src/workers/sieveCore';

let primes: PrimeBitset;
beforeAll(() => {
  const { limit, bits, primeCount } = sieveBits(2_000_000);
  primes = new PrimeBitset(limit, bits, primeCount);
});

const naiveIsPrime = (n: number) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};

describe('PrimeBitset', () => {
  it('pi() and neighbours', () => {
    expect(primes.pi(100)).toBe(25);
    expect(primes.pi(1_000_000)).toBe(78_498);
    expect(primes.pi(1)).toBe(0);
    expect(primes.pi(2)).toBe(1);
    expect(primes.prevPrime(100)).toBe(97);
    expect(primes.prevPrime(97)).toBe(89);
    expect(primes.prevPrime(2)).toBe(0);
    expect(primes.nextPrime(100)).toBe(101);
    expect(primes.nextPrime(97)).toBe(101);
    expect(primes.nextPrime(1)).toBe(2);
  });

  it('countRange stays exact across prefix-block boundaries', () => {
    for (const [lo, hi] of [[0, 512], [511, 513], [512, 1024], [100, 200_000], [1023, 1025], [0, 2_000_001]]) {
      let expected = 0;
      for (let n = lo; n < Math.min(hi, 2_000_001); n++) if (primes.isPrime(n)) expected++;
      expect(primes.countRange(lo, hi)).toBe(expected);
    }
  });
});

describe('factorize', () => {
  it('handles known values', () => {
    expect(formatFactors(factorize(360, primes))).toBe('2³ × 3² × 5');
    expect(formatFactors(factorize(1001, primes))).toBe('7 × 11 × 13');
    expect(formatFactors(factorize(97, primes))).toBe('97');
    expect(factorize(1, primes)).toEqual([]);
    expect(formatFactors(factorize(2 ** 23 - 1, primes))).toBe('47 × 178481');
  });

  it('multiplies back to n and agrees on divisor functions', () => {
    for (const n of [2, 12, 360, 5040, 99_991, 123_456, 999_999]) {
      const factors = factorize(n, primes);
      expect(factors.reduce((a, f) => a * f.p ** f.e, 1)).toBe(n);
      let count = 0;
      let sum = 0;
      for (let d = 1; d <= n; d++) if (n % d === 0) (count++, (sum += d));
      expect(divisorCount(factors)).toBe(count);
      expect(divisorSum(factors)).toBe(sum);
    }
  });
});

describe('families', () => {
  const members = (id: FamilyId, upTo: number) =>
    Array.from({ length: upTo }, (_, i) => i + 1).filter((n) => isFamilyMember(id, n, primes, { a: 1, b: 1, c: 41 }));

  it('twin primes below 100', () => {
    expect(members('twin', 100)).toEqual([3, 5, 7, 11, 13, 17, 19, 29, 31, 41, 43, 59, 61, 71, 73]);
  });

  it('cousin and sexy primes below 30', () => {
    expect(members('cousin', 30)).toEqual([3, 7, 11, 13, 17, 19, 23]);
    expect(members('sexy', 30)).toEqual([5, 7, 11, 13, 17, 19, 23, 29]);
  });

  it('safe primes below 100', () => {
    expect(members('safe', 100)).toEqual([5, 7, 11, 23, 47, 59, 83]);
  });

  it('2^k ± 1 and squares', () => {
    expect(members('pow2', 70)).toEqual([2, 3, 5, 7, 9, 15, 17, 31, 33, 63, 65]);
    expect(members('squares', 50)).toEqual([1, 4, 9, 16, 25, 36, 49]);
  });

  it('quadratic membership matches direct evaluation', () => {
    const q = { a: 1, b: 1, c: 41 };
    const direct = new Set(Array.from({ length: 200 }, (_, m) => m * m + m + 41));
    for (let n = 1; n <= 40_000; n++) expect(isQuadraticValue(n, q)).toBe(direct.has(n));
    // Euler's polynomial is prime for m = 0..39 and first fails at 40: 1681 = 41².
    for (let m = 0; m < 40; m++) expect(primes.isPrime(m * m + m + 41)).toBe(true);
    expect(primes.isPrime(40 * 40 + 40 + 41)).toBe(false);
    const withB = { a: 2, b: -3, c: 5 };
    const directB = new Set(Array.from({ length: 200 }, (_, m) => 2 * m * m - 3 * m + 5));
    for (let n = 1; n <= 20_000; n++) expect(isQuadraticValue(n, withB)).toBe(directB.has(n));
  });

  it('every family definition has a unique shader id', () => {
    expect(new Set(FAMILIES.map((f) => f.glsl)).size).toBe(FAMILIES.length);
  });
});

describe('Gaussian and Eisenstein primes', () => {
  /** Reference: a+bi is a Gaussian prime iff N is prime, or it is a unit times p ≡ 3 (mod 4). */
  const gaussianPrime = (a: number, b: number) => {
    a = Math.abs(a);
    b = Math.abs(b);
    if (a === 0 || b === 0) return naiveIsPrime(a + b) && (a + b) % 4 === 3;
    return naiveIsPrime(a * a + b * b);
  };
  /** Reference: unit multiples of p ≡ 2 (mod 3), or elements of prime norm. */
  const eisensteinPrime = (q: number, r: number) => {
    const norm = q * q + q * r + r * r;
    if (naiveIsPrime(norm)) return true;
    const s = Math.round(Math.sqrt(norm));
    return s * s === norm && s % 3 === 2 && naiveIsPrime(s) && q % s === 0 && r % s === 0;
  };

  it('Gaussian primes agree with the reference on the Ulam lattice', () => {
    for (let n = 1; n <= 20_000; n++) {
      const [x, y] = ulamCoord(n);
      expect(gaussianInfo(n, primes).prime).toBe(gaussianPrime(x, y));
    }
  });

  it('is 8-fold symmetric (the signature picture)', () => {
    const at = new Map<string, boolean>();
    for (let n = 1; n <= 40_000; n++) at.set(ulamCoord(n).join(), gaussianInfo(n, primes).prime);
    for (const [key, prime] of at) {
      const [x, y] = key.split(',').map(Number);
      for (const [u, v] of [[-x, y], [x, -y], [y, x], [-y, -x]]) {
        const other = at.get(`${u},${v}`);
        if (other !== undefined) expect(other).toBe(prime);
      }
    }
  });

  it('Eisenstein primes agree with the reference on the hex lattice', () => {
    for (let n = 1; n <= 20_000; n++) {
      const [q, r] = hexCoord(n);
      expect(eisensteinInfo(n, primes).prime).toBe(eisensteinPrime(q, r));
    }
  });

  it('known small cases', () => {
    // 3 is a Gaussian prime (3 ≡ 3 mod 4) but 5 = (2+i)(2-i) is not a prime *on the axis*.
    const site = (x: number, y: number) => {
      for (let n = 1; n < 500; n++) if (ulamCoord(n).join() === `${x},${y}`) return n;
      throw new Error('site not found');
    };
    expect(gaussianInfo(site(3, 0), primes).prime).toBe(true);
    expect(gaussianInfo(site(5, 0), primes).prime).toBe(false);
    expect(gaussianInfo(site(1, 1), primes).prime).toBe(true);
    expect(gaussianInfo(site(2, 1), primes).prime).toBe(true);
  });
});

describe('fixed-point turns (GLSL turnsFixed)', () => {
  /** Faithful float32 emulation of the shader's arithmetic. */
  const turnsFixed = (n: number, g: Vector3) => {
    const hi = ((g.x << 16) | g.y) >>> 0;
    const low = Math.imul(n, hi) >>> 0;
    const f = Math.fround;
    const t = f(f(low) * 2 ** -32) + f(f(f(n) * g.z) * 2 ** -53);
    return t - Math.floor(t);
  };

  it('packs a fraction into limbs that reconstruct it to ~1e-16', () => {
    for (const g of [0, 0.381966011250105, 137.5077640500378 / 360, 1 / (2 * Math.PI), 0.9999999]) {
      const v = packTurns(g, new Vector3());
      const back = (v.x * 65536 + v.y) / 2 ** 32 + v.z / 2 ** 53;
      expect(Math.abs(back - g)).toBeLessThan(1e-15);
    }
  });

  it('keeps the angle accurate where plain float32 n·g is useless', () => {
    const g = 137.5077640500378 / 360;
    const limbs = packTurns(g, new Vector3());
    let worstFixed = 0;
    let worstNaive = 0;
    for (const n of [1, 2, 3, 100, 12_345, 262_144, 1_000_003, 5_000_011, 9_999_991, 10_000_000]) {
      const exact = n * g - Math.floor(n * g);
      const wrap = (d: number) => Math.min(Math.abs(d), 1 - Math.abs(d));
      worstFixed = Math.max(worstFixed, wrap(turnsFixed(n, limbs) - exact));
      const naive = Math.fround(Math.fround(n) * Math.fround(g));
      worstNaive = Math.max(worstNaive, wrap(naive - Math.floor(naive) - exact));
    }
    // 1e-6 turns × 2π × radius 1800 ≈ 0.01 units: invisible even at 300 px/unit.
    expect(worstFixed).toBeLessThan(1e-6);
    expect(worstNaive).toBeGreaterThan(1e-3);
  });
});
