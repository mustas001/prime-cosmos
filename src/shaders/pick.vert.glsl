// ---------------------------------------------------------------------------
// GPU picking. The render target is a single pixel. Every integer whose on-screen
// hit area contains the cursor is collapsed onto that pixel with depth = distance to
// the cursor, so the depth test keeps the nearest one and the colour holds its id.
// Because it runs the very same layout/morph code as the draw pass, the answer is
// right at every zoom level and in the middle of a transition.
// ---------------------------------------------------------------------------

uniform vec2 uCursor;        // device px from the viewport centre, y up
uniform float uMinHitPx;     // smallest hit radius
uniform float uMaxHitPx;     // largest hit radius (and the depth normaliser)

flat out int vN;

void reject() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
  vN = 0;
}

void main() {
  int n = uBase + gl_VertexID + 1;
  if (n > uCount) { reject(); return; }

  bool prime = isPrimeField(n);
  if (!prime && uCompAlpha < 0.003) { reject(); return; }

  bool morphing = isMorphing();
  float flash = 0.0;
  vec2 pos = morphing ? morphPos(n, flash) : topoPos(uTopoC, n);
  vec2 metrics = morphing ? morphMetrics(n, float(n)) : topoMetrics(uTopoC, float(n));

  vec2 px = ((pos - uCenterHi) - uCenterLo) * uScale;
  float dotPx = metrics.x * metrics.y * uScale * uDotScale * (prime ? uPrimeScale : uCompScale);
  float hit = clamp(0.5 * dotPx, uMinHitPx, uMaxHitPx);

  float dist = length(px - uCursor);
  if (dist > hit) { reject(); return; }

  // Primes win ties against nearby composites.
  float score = dist / uMaxHitPx * (prime ? 0.7 : 1.0);
  gl_Position = vec4(0.0, 0.0, clamp(score, 0.0, 1.0) * 2.0 - 1.0, 1.0);
  gl_PointSize = 1.0;
  vN = n;
}
