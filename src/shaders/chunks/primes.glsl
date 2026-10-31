// ---------------------------------------------------------------------------
// Primality and families, read from the bit-packed sieve uploaded as an R8UI texture.
// ---------------------------------------------------------------------------

bool isPrimeInt(int n) {
  if (n < 2 || n > uLimit) return false;
  int byteIdx = n >> 3;
  uint b = texelFetch(uBits, ivec2(byteIdx & ROW_MASK, byteIdx >> ROW_SHIFT), 0).r;
  return ((b >> uint(n & 7)) & 1u) != 0u;
}

// "Prime" for the selected field. Gaussian / Eisenstein primes live on a 2-D lattice;
// integer n is mapped to a lattice site by the Ulam / hex spiral numbering.
bool isPrimeField(int n) {
  if (uField == 0) return isPrimeInt(n);

  if (uField == 1) {
    ivec2 u = ulamCoord(n);
    int a = abs(u.x);
    int b = abs(u.y);
    if (a == 0 || b == 0) {
      int m = a + b;
      return (m & 3) == 3 && isPrimeInt(m);
    }
    return isPrimeInt(a * a + b * b);
  }

  ivec2 h = hexCoord(n);
  int norm = h.x * h.x + h.x * h.y + h.y * h.y;
  if (isPrimeInt(norm)) return true;
  int s = isqrt(norm);
  if (s * s == norm && s % 3 == 2 && isPrimeInt(s)) {
    return abs(h.x) % s == 0 && abs(h.y) % s == 0;
  }
  return false;
}

bool isQuadraticValue(int n) {
  int disc = uQuadB * uQuadB + 4 * uQuadA * (n - uQuadC);
  if (disc < 0) return false;
  int s = isqrt(disc);
  if (s * s != disc) return false;
  int num1 = s - uQuadB;
  int num2 = -s - uQuadB;
  int d = 2 * uQuadA;
  return (num1 >= 0 && num1 % d == 0) || (num2 >= 0 && num2 % d == 0);
}

bool isFamilyMember(int n, bool prime) {
  if (uFamily == 1) return prime && (isPrimeInt(n - 2) || isPrimeInt(n + 2));
  if (uFamily == 2) return prime && (isPrimeInt(n - 4) || isPrimeInt(n + 4));
  if (uFamily == 3) return prime && (isPrimeInt(n - 6) || isPrimeInt(n + 6));
  if (uFamily == 4) return prime && (n & 1) == 1 && isPrimeInt((n - 1) / 2);
  if (uFamily == 5) return isQuadraticValue(n);
  if (uFamily == 6) return n >= 2 && (((n + 1) & n) == 0 || ((n - 1) & (n - 2)) == 0);
  if (uFamily == 7) {
    int s = isqrt(n);
    return s * s == n;
  }
  return false;
}
