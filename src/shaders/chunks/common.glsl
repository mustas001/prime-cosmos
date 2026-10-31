// ---------------------------------------------------------------------------
// Math helpers shared by every vertex shader.
// ---------------------------------------------------------------------------

#define PI 3.14159265358979
#define TAU 6.28318530717959

// PCG hash -> uniform float in [0, 1). Stable per integer, so LOD thinning and
// morph staggering never flicker between frames.
uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float hash01(int n) {
  return float(pcg(uint(n)) >> 8u) * (1.0 / 16777216.0);
}

// floor(sqrt(n)), exact. float(n) is only accurate to 24 bits, so the estimate is
// off by at most one and two integer comparisons repair it.
int isqrt(int n) {
  int s = int(sqrt(float(n)));
  s -= int(s * s > n);
  s += int((s + 1) * (s + 1) <= n);
  return s;
}

// frac(n * g) to ~1e-9 turns for n < 2^24, where g is a fixed-point fraction:
//   g = hi / 2^32 + lo / 2^53,  packed as vec3(hi >> 16, hi & 0xffff, lo).
// A plain float32 n * g loses every significant bit of the angle once n is in the
// millions; this keeps the low 32 bits in exact (wrapping) uint arithmetic.
float turnsFixed(int n, vec3 g) {
  uint hi = (uint(g.x) << 16u) | uint(g.y);
  uint low = uint(n) * hi;
  float t = float(low) * (1.0 / 4294967296.0) + float(n) * g.z * (1.0 / 9007199254740992.0);
  return fract(t);
}

// (cos, sin) of 2*pi*t, accurate to ~1e-7 for any t. The GLSL ES spec lets the builtin
// sin/cos be off by 2^-11 (~5e-4), which at a radius of ~1800 units misplaces a point by
// almost a whole lattice step and scrambles every spiral at high n. So: fold into
// [-1/8, 1/8] turns around the nearest quadrant, evaluate a Taylor series, rotate back.
vec2 cosSinTurns(float t) {
  t = fract(t);
  float q = floor(t * 4.0 + 0.5);
  float x = TAU * (t - 0.25 * q);
  float x2 = x * x;
  float s = x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 + x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))));
  float c = 1.0 + x2 * (-0.5 + x2 * (1.0 / 24.0 + x2 * (-1.0 / 720.0 + x2 * (1.0 / 40320.0 + x2 * (-1.0 / 3628800.0)))));
  int k = int(q) & 3;
  if (k == 0) return vec2(c, s);
  if (k == 1) return vec2(-s, c);
  if (k == 2) return vec2(-c, -s);
  return vec2(s, -c);
}
