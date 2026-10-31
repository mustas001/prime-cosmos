// ---------------------------------------------------------------------------
// Reticle drawn around one integer (hover or selection). Runs the same layout/morph
// code as the draw pass, so it rides along with the point during a transition.
// ---------------------------------------------------------------------------

uniform int uMarkerN;
uniform float uMarkerMinPx;

out float vSizePx;
out float vDotFrac;

void main() {
  int n = uMarkerN;
  if (n < 1 || n > uCount) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vSizePx = 4.0;
    vDotFrac = 0.5;
    return;
  }

  bool prime = isPrimeField(n);
  bool morphing = isMorphing();
  float flash = 0.0;
  vec2 pos = morphing ? morphPos(n, flash) : topoPos(uTopoC, n);
  vec2 metrics = morphing ? morphMetrics(n, float(n)) : topoMetrics(uTopoC, float(n));
  vec2 px = ((pos - uCenterHi) - uCenterLo) * uScale;

  float dotPx = metrics.x * metrics.y * uScale * uDotScale * (prime ? uPrimeScale : uCompScale);
  float size = clamp(max(dotPx * 1.9, uMarkerMinPx), 3.0, uMaxPoint);

  gl_Position = vec4(px * 2.0 / uResolution, 0.0, 1.0);
  gl_PointSize = size;
  vSizePx = size;
  vDotFrac = min(dotPx, size / 1.9) / size;
}
