import { hexCoord, isqrt, ulamCoord } from '../topology/topologies';
import type { PrimeBitset } from './PrimeBitset';

/**
 * Which notion of "prime" colours the points.
 *
 * Gaussian and Eisenstein primes live on 2-D lattices, so every integer index n is mapped to
 * a lattice site by the Ulam (square) or hex (triangular) spiral numbering — no matter which
 * layout is on screen. Morphing from the Ulam spiral to another layout then rearranges the
 * *same* sites, which is what makes the symmetric Gaussian-prime pattern so striking.
 */
export type FieldId = 'integers' | 'gaussian' | 'eisenstein';

export const FIELD_GLSL: Record<FieldId, number> = { integers: 0, gaussian: 1, eisenstein: 2 };

export interface LatticeInfo {
  /** Lattice coordinates of the site (Gaussian: a + bi; Eisenstein: axial q, r). */
  coords: [number, number];
  norm: number;
  prime: boolean;
}

/** a + bi is a Gaussian prime iff a²+b² is prime, or it is a unit times a prime p ≡ 3 (mod 4). */
export function gaussianInfo(n: number, primes: PrimeBitset): LatticeInfo {
  const [x, y] = ulamCoord(n);
  const a = Math.abs(x);
  const b = Math.abs(y);
  const norm = a * a + b * b;
  const prime = a === 0 || b === 0 ? (a + b) % 4 === 3 && primes.isPrime(a + b) : primes.isPrime(norm);
  return { coords: [x, y], norm, prime };
}

/**
 * q + r·e^{iπ/3} (norm q²+qr+r²) is an Eisenstein prime iff its norm is prime, or it is a
 * unit times a rational prime p ≡ 2 (mod 3).
 */
export function eisensteinInfo(n: number, primes: PrimeBitset): LatticeInfo {
  const [q, r] = hexCoord(n);
  const norm = q * q + q * r + r * r;
  let prime = primes.isPrime(norm);
  if (!prime && norm > 1) {
    const s = isqrt(norm);
    prime = s * s === norm && s % 3 === 2 && primes.isPrime(s) && q % s === 0 && r % s === 0;
  }
  return { coords: [q, r], norm, prime };
}

export function isPrimeInField(field: FieldId, n: number, primes: PrimeBitset): boolean {
  switch (field) {
    case 'integers':
      return primes.isPrime(n);
    case 'gaussian':
      return gaussianInfo(n, primes).prime;
    case 'eisenstein':
      return eisensteinInfo(n, primes).prime;
  }
}
