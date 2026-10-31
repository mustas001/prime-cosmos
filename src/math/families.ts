import { isqrt } from '../topology/topologies';
import type { PrimeBitset } from './PrimeBitset';

/** Highlightable families of integers. Their GLSL twins live in shaders/chunks/primes.glsl. */
export type FamilyId = 'none' | 'twin' | 'cousin' | 'sexy' | 'safe' | 'quadratic' | 'pow2' | 'squares';

export interface Quadratic {
  a: number;
  b: number;
  c: number;
}

export interface FamilyDef {
  id: FamilyId;
  /** Index used by the shader's isFamilyMember() switch. */
  glsl: number;
  label: string;
  blurb: string;
  /** Linear-RGB accent used for the family's rings and prime cores. */
  color: readonly [number, number, number];
  /** Minimum ring diameter in CSS px, so very sparse families stay findable when zoomed out. */
  minRingPx: number;
}

export const FAMILIES: readonly FamilyDef[] = [
  { id: 'none', glsl: 0, label: 'None', blurb: '', color: [1, 1, 1], minRingPx: 0 },
  {
    id: 'twin',
    glsl: 1,
    label: 'Twin primes (p, p+2)',
    blurb: 'Primes with another prime two away.',
    color: [0.1, 0.85, 1.0],
    minRingPx: 0,
  },
  {
    id: 'cousin',
    glsl: 2,
    label: 'Cousin primes (p, p+4)',
    blurb: 'Primes with another prime four away.',
    color: [1.0, 0.72, 0.1],
    minRingPx: 0,
  },
  {
    id: 'sexy',
    glsl: 3,
    label: 'Sexy primes (p, p+6)',
    blurb: 'Primes with another prime six away.',
    color: [0.85, 0.3, 1.0],
    minRingPx: 0,
  },
  {
    id: 'safe',
    glsl: 4,
    label: 'Safe primes (p = 2q+1)',
    blurb: 'Primes whose half-predecessor (p−1)/2 is also prime.',
    color: [0.45, 1.0, 0.3],
    minRingPx: 0,
  },
  {
    id: 'quadratic',
    glsl: 5,
    label: 'Quadratic a·n² + b·n + c',
    blurb: "Values of a prime-rich polynomial; Euler's n² + n + 41 is prime for n = 0…39.",
    color: [1.0, 0.85, 0.35],
    minRingPx: 10,
  },
  {
    id: 'pow2',
    glsl: 6,
    label: 'Mersenne & Fermat (2ᵏ ± 1)',
    blurb: 'Numbers one away from a power of two. Very sparse — rings stay visible when zoomed out.',
    color: [0.3, 1.0, 0.6],
    minRingPx: 22,
  },
  {
    id: 'squares',
    glsl: 7,
    label: 'Perfect squares',
    blurb: 'k². They trace the Ulam diagonals and the Sacks baseline.',
    color: [0.55, 0.75, 1.0],
    minRingPx: 0,
  },
];

const byId = new Map(FAMILIES.map((f) => [f.id, f]));
export const getFamily = (id: FamilyId): FamilyDef => byId.get(id)!;

export const QUADRATIC_PRESETS: Record<string, Quadratic> = {
  "Euler n² + n + 41": { a: 1, b: 1, c: 41 },
  'Landau n² + 1': { a: 1, b: 0, c: 1 },
  'Legendre 2n² + 29': { a: 2, b: 0, c: 29 },
  'n² − n + 41': { a: 1, b: -1, c: 41 },
};

/** Does a·m² + b·m + c = n for some integer m ≥ 0? */
export function isQuadraticValue(n: number, { a, b, c }: Quadratic): boolean {
  const disc = b * b + 4 * a * (n - c);
  if (disc < 0) return false;
  const s = isqrt(disc);
  if (s * s !== disc) return false;
  return [s - b, -s - b].some((num) => num >= 0 && num % (2 * a) === 0);
}

export function isFamilyMember(id: FamilyId, n: number, primes: PrimeBitset, quad: Quadratic): boolean {
  const prime = primes.isPrime(n);
  switch (id) {
    case 'none':
      return false;
    case 'twin':
      return prime && (primes.isPrime(n - 2) || primes.isPrime(n + 2));
    case 'cousin':
      return prime && (primes.isPrime(n - 4) || primes.isPrime(n + 4));
    case 'sexy':
      return prime && (primes.isPrime(n - 6) || primes.isPrime(n + 6));
    case 'safe':
      return prime && n % 2 === 1 && primes.isPrime((n - 1) / 2);
    case 'quadratic':
      return isQuadraticValue(n, quad);
    case 'pow2':
      return n >= 2 && (((n + 1) & n) === 0 || ((n - 1) & (n - 2)) === 0);
    case 'squares': {
      const s = isqrt(n);
      return s * s === n;
    }
  }
}
