import type { PrimeBitset } from './PrimeBitset';

export interface Factor {
  p: number;
  e: number;
}

/** Prime factorization by trial division, skipping composite divisors via the sieve. */
export function factorize(n: number, primes: PrimeBitset): Factor[] {
  const out: Factor[] = [];
  let m = n;
  if (m < 2) return out;

  for (let d = 2; d * d <= m; d += d === 2 ? 1 : 2) {
    if (d <= primes.limit && !primes.isPrime(d)) continue;
    if (m % d !== 0) continue;
    let e = 0;
    while (m % d === 0) {
      m /= d;
      e++;
    }
    out.push({ p: d, e });
  }
  if (m > 1) out.push({ p: m, e: 1 });
  return out;
}

export function divisorCount(factors: readonly Factor[]): number {
  return factors.reduce((acc, f) => acc * (f.e + 1), 1);
}

export function divisorSum(factors: readonly Factor[]): number {
  return factors.reduce((acc, f) => acc * ((f.p ** (f.e + 1) - 1) / (f.p - 1)), 1);
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (e: number) =>
  String(e)
    .split('')
    .map((d) => SUPERSCRIPT[+d])
    .join('');

/** "2³ × 3² × 5" */
export function formatFactors(factors: readonly Factor[]): string {
  return factors.map((f) => (f.e > 1 ? `${f.p}${superscript(f.e)}` : `${f.p}`)).join(' × ');
}
