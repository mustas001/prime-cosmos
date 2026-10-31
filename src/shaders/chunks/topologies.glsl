// ---------------------------------------------------------------------------
// Topologies: closed-form integer -> plane maps. n is 1-based; every layout puts
// n = 1 at (or beside) the origin and has roughly one point per unit of area.
//
// Anything that needs more than float32's 24 bits is done in exact int/uint
// arithmetic (ring and row indices, Sacks' sqrt fraction, phyllotaxis angle).
// Mirrors src/topology/topologies.ts.
// ---------------------------------------------------------------------------

// 0 -- Matrix: rows of uWidth consecutive integers, centred, reading downwards.
vec2 topoMatrix(int n) {
  int m = n - 1;
  int row = m / uWidth;
  int col = m - row * uWidth;
  return vec2(float(col) - 0.5 * float(uWidth - 1), -float(row));
}

// 1 -- Pyramid: row r (0-based) holds r+1 integers. r = floor((sqrt(8m+1) - 1) / 2).
vec2 topoPyramid(int n) {
  int m = n - 1;
  int r = (isqrt(8 * m + 1) - 1) / 2;
  int c = m - (r * (r + 1)) / 2;
  return vec2(float(c) - 0.5 * float(r), -float(r) * TRI_DY);
}

// 2 -- Ulam: square spiral, right/up/left/down. Ring k holds (2k-1)^2+1 .. (2k+1)^2
// and is walked as four sides of 2k integers starting just above the bottom-right corner.
ivec2 ulamCoord(int n) {
  if (n <= 1) return ivec2(0);
  int k = (isqrt(n - 1) + 1) / 2;
  int o = n - (2 * k - 1) * (2 * k - 1) - 1;
  int side = o / (2 * k);
  int t = o - side * 2 * k;
  if (side == 0) return ivec2(k, -k + 1 + t);
  if (side == 1) return ivec2(k - 1 - t, k);
  if (side == 2) return ivec2(-k, k - 1 - t);
  return ivec2(-k + 1 + t, -k);
}

// 5 -- Hex spiral on the triangular lattice, axial (q, r). Ring k holds 6k integers,
// n = 3k(k-1)+2 .. 3k(k+1)+1, starting one step above the SE corner and winding CCW.
ivec2 hexCoord(int n) {
  if (n <= 1) return ivec2(0);
  int m = n - 2;
  int k = int((3.0 + sqrt(9.0 + 12.0 * float(m))) / 6.0);
  k -= int(3 * k * (k - 1) > m);
  k += int(3 * k * (k + 1) <= m);
  int o = m - 3 * k * (k - 1);
  if (o < k) return ivec2(k, 1 - k + o);
  o -= k;
  int side = o / k;
  int t = o - side * k + 1;
  if (side == 0) return ivec2(k - t, t);
  if (side == 1) return ivec2(-t, k);
  if (side == 2) return ivec2(-k, k - t);
  if (side == 3) return ivec2(-k + t, -t);
  return ivec2(t, -k);
}

// 3 -- Sacks: r = sqrt(n), theta = 2*pi*sqrt(n). Perfect squares land on the +x axis.
// frac(sqrt(n)) = (n - s^2) / (sqrt(n) + s) is computed without cancellation.
vec2 topoSacks(int n) {
  int s = isqrt(n);
  float root = sqrt(float(n));
  float f = float(n - s * s) / (root + float(s));
  return RADIAL_C * root * cosSinTurns(f);
}

// 4 -- Phyllotaxis: r = C * n^p, theta = n * angle (fixed-point turns).
vec2 topoPhyllotaxis(int n) {
  float nf = float(n);
  float r = RADIAL_C * (uExponent == 0.5 ? sqrt(nf) : pow(nf, uExponent));
  return r * cosSinTurns(turnsFixed(n, uAngle));
}

// 6 -- Modular clock: angle = n mod m (residue 0 at 12 o'clock, clockwise), r = sqrt(n).
vec2 topoClock(int n) {
  int k = n - (n / uModulus) * uModulus;
  float r = RADIAL_C * sqrt(float(n));
  return r * cosSinTurns(0.25 - float(k) / float(uModulus));
}

// 7 -- Serpentine: the matrix with every odd row reversed (boustrophedon).
vec2 topoSerpentine(int n) {
  int m = n - 1;
  int row = m / uWidth;
  int col = m - row * uWidth;
  if ((row & 1) == 1) col = uWidth - 1 - col;
  return vec2(float(col) - 0.5 * float(uWidth - 1), -float(row));
}

// 8 -- Cantor diagonals: anti-diagonal d holds d+1 integers, walked in alternating directions.
vec2 topoCantor(int n) {
  int m = n - 1;
  int d = (isqrt(8 * m + 1) - 1) / 2;
  int k = m - (d * (d + 1)) / 2;
  if ((d & 1) == 1) k = d - k;
  return vec2(float(k), -float(d - k));
}

// 9 -- Hilbert curve, order 12 (a 4096 x 4096 grid), the standard iterative d2xy.
ivec2 hilbertCoord(int n) {
  int t = n - 1;
  int x = 0;
  int y = 0;
  for (int s = 1; s < 4096; s <<= 1) {
    int rx = 1 & (t >> 1);
    int ry = 1 & (t ^ rx);
    if (ry == 0) {
      if (rx == 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      int swapped = x;
      x = y;
      y = swapped;
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return ivec2(x, y);
}

// 10 -- Peano curve, 8 levels (a 6561 x 6561 grid). Each base-9 digit picks a 3x3 sub-block
// visited column by column; a sub-block is mirrored in x in the middle row and in y in an
// odd column, accumulated by XOR, so each block's exit meets the next block's entrance.
ivec2 peanoCoord(int n) {
  int t = n - 1;
  int p = 4782969; // 9^7
  int x = 0;
  int y = 0;
  int flipX = 0;
  int flipY = 0;
  for (int i = 0; i < 8; i++) {
    int b = (t / p) % 9;
    int c = b / 3;
    int q = b - 3 * c;
    int row = (c & 1) == 0 ? q : 2 - q;
    x = x * 3 + (flipX == 1 ? 2 - c : c);
    y = y * 3 + (flipY == 1 ? 2 - row : row);
    flipX ^= row & 1;
    flipY ^= c & 1;
    p /= 9;
  }
  return ivec2(x, y);
}

// 11 -- Z-order (Morton): the even bits of n-1 are x, the odd bits are y.
int compactBits(int v) {
  v &= 0x55555555;
  v = (v | (v >> 1)) & 0x33333333;
  v = (v | (v >> 2)) & 0x0F0F0F0F;
  v = (v | (v >> 4)) & 0x00FF00FF;
  v = (v | (v >> 8)) & 0x0000FFFF;
  return v;
}

vec2 topoMorton(int n) {
  int d = n - 1;
  return vec2(float(compactBits(d)), float(compactBits(d >> 1)));
}

vec2 topoPos(int id, int n) {
  if (id == 0) return topoMatrix(n);
  if (id == 1) return topoPyramid(n);
  if (id == 2) return vec2(ulamCoord(n));
  if (id == 3) return topoSacks(n);
  if (id == 4) return topoPhyllotaxis(n);
  if (id == 5) {
    ivec2 h = hexCoord(n);
    return vec2(float(h.x) + 0.5 * float(h.y), float(h.y) * TRI_DY);
  }
  if (id == 6) return topoClock(n);
  if (id == 7) return topoSerpentine(n);
  if (id == 8) return topoCantor(n);
  if (id == 9) return vec2(hilbertCoord(n));
  if (id == 10) return vec2(peanoCoord(n));
  return topoMorton(n);
}

// x: spacing -- sqrt(area per point) in world units, which drives LOD thinning and the
//    point-density maths. y: how large a dot may be relative to that spacing before
//    neighbouring dots (or spiral arms) start to merge.
vec2 topoMetrics(int id, float nf) {
  if (id == 1 || id == 5) return vec2(sqrt(TRI_DY), 1.0);
  if (id == 3) return vec2(1.0, 0.8);
  if (id == 4) return vec2(RADIAL_C * sqrt(TAU * uExponent) * pow(nf, uExponent - 0.5), 0.9);
  if (id == 6) return vec2(1.0, 0.55);
  // Unit-pitch lattices: matrix, Ulam, serpentine, Cantor, Hilbert, Peano, Z-order.
  return vec2(1.0, 1.0);
}

// ---------------------------------------------------------------------------
// Morphing. Each point follows a curved path from its source to its target position;
// its own easing window is staggered by a mix of outward radius (so the wave ripples
// from the centre) and a per-integer hash (so it feels organic, not mechanical).
// ---------------------------------------------------------------------------

float stageEase(float p, int n) {
  float wave = mix(sqrt(float(n) / float(max(uCount, 1))), hash01(n), 0.35);
  float t = clamp((p - wave * uStagger) / max(1.0 - uStagger, 1e-3), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// Straight-line interpolation plus a perpendicular bulge that peaks mid-flight,
// so the whole cloud swirls rather than sliding.
vec2 blendPath(vec2 a, vec2 b, float e) {
  vec2 d = b - a;
  return a + d * e + vec2(-d.y, d.x) * (uSwirl * sin(PI * e));
}

vec2 morphPos(int n, out float flash) {
  vec2 p = topoPos(uTopoA, n);
  flash = 0.0;
  float e1 = 0.0;
  if (uMixAB > 0.0) {
    e1 = stageEase(uMixAB, n);
    p = blendPath(p, topoPos(uTopoB, n), e1);
  }
  float e2 = stageEase(uTransitionProgress, n);
  p = blendPath(p, topoPos(uTopoC, n), e2);
  flash = sin(PI * e2) + sin(PI * e1) * (1.0 - e2);
  return p;
}

vec2 morphMetrics(int n, float nf) {
  vec2 m = topoMetrics(uTopoA, nf);
  if (uMixAB > 0.0) m = mix(m, topoMetrics(uTopoB, nf), stageEase(uMixAB, n));
  return mix(m, topoMetrics(uTopoC, nf), stageEase(uTransitionProgress, n));
}

// True while any transition stage is in flight; otherwise only topology C is evaluated.
bool isMorphing() {
  return uTransitionProgress < 1.0 || uMixAB > 0.0;
}
