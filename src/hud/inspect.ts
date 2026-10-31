import { divisorCount, divisorSum, factorize, type Factor } from '../math/factorize';
import { FAMILIES, isFamilyMember, type Quadratic } from '../math/families';
import { eisensteinInfo, gaussianInfo, type LatticeInfo } from '../math/fields';
import type { PrimeBitset } from '../math/PrimeBitset';
import { getTopology, type TopologyId, type TopologyParams } from '../topology/topologies';

/** Everything the inspector shows about one integer. */
export interface IntegerInfo {
  n: number;
  prime: boolean;
  factors: Factor[];
  divisors: number;
  sigma: number;
  /** π(n): how many primes are ≤ n. */
  pi: number;
  prevPrime: number;
  nextPrime: number;
  /** Distance to the neighbouring primes; for a prime, the gap to the next one. */
  gap: number;
  residues: { mod4: number; mod6: number; mod10: number; mod30: number };
  families: string[];
  gaussian: LatticeInfo;
  eisenstein: LatticeInfo;
  /** Where the integer currently sits in the selected layout (world units). */
  position: readonly [number, number];
}

export function describeInteger(
  n: number,
  primes: PrimeBitset,
  topology: TopologyId,
  params: TopologyParams,
  quad: Quadratic,
): IntegerInfo {
  const prime = primes.isPrime(n);
  const factors = factorize(n, primes);
  const prevPrime = primes.prevPrime(n);
  const nextPrime = primes.nextPrime(n);

  return {
    n,
    prime,
    factors,
    divisors: divisorCount(factors),
    sigma: divisorSum(factors),
    pi: primes.pi(n),
    prevPrime,
    nextPrime,
    gap: prime ? (nextPrime > 0 ? nextPrime - n : 0) : prevPrime > 0 && nextPrime > 0 ? nextPrime - prevPrime : 0,
    residues: { mod4: n % 4, mod6: n % 6, mod10: n % 10, mod30: n % 30 },
    families: FAMILIES.filter((f) => f.id !== 'none' && isFamilyMember(f.id, n, primes, quad)).map((f) => f.label),
    gaussian: gaussianInfo(n, primes),
    eisenstein: eisensteinInfo(n, primes),
    position: getTopology(topology).position(n, params),
  };
}
