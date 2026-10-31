// ---------------------------------------------------------------------------
// Main draw pass. One vertex per integer; no attributes at all. Everything — layout,
// morph, primality, family membership, size, colour, culling — is derived from
// gl_VertexID and uniforms.
//
// Light is additive and energy-conserving: a dot smaller than a pixel is drawn as a
// 3 px sprite carrying only the dot's area as energy, so zooming out turns the
// composites into a faint, constant-brightness haze instead of a white-out, while
// primes keep a brightness floor so they never vanish.
// ---------------------------------------------------------------------------

uniform float uGlow;
uniform float uPrimeFloor;
uniform float uFocus;
uniform float uKeepK;          // composites/px kept when thinning
uniform float uPrimeDensity;   // ~1/ln(n) near the view, for the auto-exposure of dense primes
uniform float uAppear;         // intro reveal, 0..1
uniform float uLabels;         // numerals inside dots
uniform float uFamilyMinPx;
uniform int uColorMode;
uniform vec3 uColPrime;
uniform vec3 uColComp;
uniform vec3 uColAccent;

flat out int vN;
flat out int vDigits;
out vec3 vCore;     // HDR colour of the dot
out vec3 vHalo;     // HDR colour of the glow
out vec3 vRing;     // family ring colour
out vec4 vShape;    // x: dot radius / sprite radius, y: sprite px, z: label alpha, w: ring radius / sprite radius
out vec2 vMisc;     // x: diffraction-spike strength, y: 1 for primes

void cull() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vN = 0;
  vDigits = 1;
  vCore = vec3(0.0);
  vHalo = vec3(0.0);
  vRing = vec3(0.0);
  vShape = vec4(0.5, 4.0, 0.0, 0.0);
  vMisc = vec2(0.0);
}

vec3 primeTint(int n) {
  if (uColorMode == 0) return uColPrime;
  vec3 red = vec3(1.0, 0.10, 0.22);
  vec3 cyan = vec3(0.10, 0.80, 1.0);
  vec3 white = vec3(1.0, 0.92, 0.88);
  if (uColorMode == 1) {            // last decimal digit: 1 / 3 / 7 / 9
    int d = n - (n / 10) * 10;
    if (d == 1) return red;
    if (d == 3) return vec3(1.0, 0.55, 0.06);
    if (d == 7) return cyan;
    if (d == 9) return vec3(0.65, 0.30, 1.0);
    return white;
  }
  if (uColorMode == 2) {            // mod 4: sums of two squares vs the rest
    int d = n - (n / 4) * 4;
    return d == 1 ? red : (d == 3 ? cyan : white);
  }
  int d = n - (n / 6) * 6;          // mod 6: 6k+1 vs 6k-1
  return d == 1 ? red : (d == 5 ? cyan : white);
}

void main() {
  int n = uBase + gl_VertexID + 1;
  if (n > uCount) { cull(); return; }
  float nf = float(n);

  bool prime = isPrimeField(n);
  bool member = uFamily != 0 && isFamilyMember(n, prime);
  bool morphing = isMorphing();

  vec2 metrics = morphing ? morphMetrics(n, nf) : topoMetrics(uTopoC, nf);
  float spacingPx = metrics.x * uScale;

  // LOD: when composites are denser than uKeepK per pixel, keep a stable random subset
  // and brighten the survivors to compensate. Done before the expensive position maths.
  float keep = 1.0;
  if (!prime && !member) {
    if (uCompAlpha < 0.003) { cull(); return; }
    keep = min(1.0, uKeepK * spacingPx * spacingPx);
    if (keep < 1.0 && hash01(n) > keep) { cull(); return; }
  }

  float appear = clamp(uAppear * 1.7 - sqrt(nf / float(max(uCount, 1))) * 0.7, 0.0, 1.0);
  appear = appear * appear * (3.0 - 2.0 * appear);
  if (appear <= 0.0) { cull(); return; }

  float flash = 0.0;
  vec2 pos = morphing ? morphPos(n, flash) : topoPos(uTopoC, n);
  vec2 px = ((pos - uCenterHi) - uCenterLo) * uScale;

  // ---- size ---------------------------------------------------------------
  float refPx = spacingPx * metrics.y * uDotScale;
  float dotPx = refPx * (prime ? uPrimeScale : uCompScale) * appear * (1.0 + 0.5 * flash);

  // Glow reach shrinks as dots grow, so big dots stay crisp instead of turning into blobs.
  float pad = prime ? 1.0 + 1.3 * uGlow / (1.0 + dotPx / 30.0) : 1.25;
  float want = dotPx * pad;
  float ringPx = 0.0;
  if (member) {
    ringPx = max(dotPx * 1.5, uFamilyMinPx);
    want = max(want, ringPx * 1.3);
  }
  float sprite = clamp(want, 3.0, uMaxPoint);

  vec2 limit = 0.5 * uResolution + 0.5 * sprite + 2.0;
  if (abs(px.x) > limit.x || abs(px.y) > limit.y) { cull(); return; }

  float dotEff = min(dotPx, sprite / max(pad, 1.0));
  float energy = min(1.0, dotEff * dotEff * 0.785);

  // ---- colour ---------------------------------------------------------------
  vec3 core;
  vec3 halo = vec3(0.0);
  vec3 ring = vec3(0.0);
  float dim = (uFamily != 0 && !member) ? 1.0 - uFocus : 1.0;
  if (prime) {
    vec3 tint = primeTint(n);
    if (member) tint = mix(tint, uColAccent, 0.9);
    // Auto-exposure: when many primes share a pixel, share the light too.
    float ppx = uPrimeDensity / max(spacingPx * spacingPx, 1e-6);
    float e = max(energy, uPrimeFloor) / (1.0 + 2.0 * ppx) * dim * appear;
    // Big dots need less HDR gain: it would only bloom over their own numerals.
    float gain = 1.0 + 0.8 / (1.0 + dotEff / 14.0);
    core = tint * gain * e;
    halo = tint * uGlow * 0.5 * e;
  } else {
    float e = energy * (member ? max(uCompAlpha, 0.55) : uCompAlpha) / keep;
    core = uColComp * e;
  }
  if (member) ring = uColAccent * 1.5 * appear;

  // ---- numerals inside big dots --------------------------------------------
  float label = 0.0;
  int digits = 1;
  if (uLabels > 0.5 && dotEff > 22.0) {
    for (int t = n; t >= 10; t /= 10) digits++;
    float advance = min(0.34, 0.8 / float(digits));
    float heightPx = dotEff * min(advance / 0.56, 0.52);
    label = smoothstep(8.0, 13.0, heightPx) * appear;
  }

  gl_Position = vec4(px * 2.0 / uResolution, 0.0, 1.0);
  gl_PointSize = sprite;

  vN = n;
  vDigits = digits;
  vCore = core;
  vHalo = halo;
  vRing = ring;
  vShape = vec4(dotEff / sprite, sprite, label, member ? ringPx / sprite : 0.0);
  vMisc = vec2(prime ? smoothstep(6.0, 22.0, dotEff) : 0.0, prime ? 1.0 : 0.0);
}
