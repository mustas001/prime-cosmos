uniform sampler2D uGlyphs;   // 10 digits side by side, white on black

flat in int vN;
flat in int vDigits;
in vec3 vCore;
in vec3 vHalo;
in vec3 vRing;
in vec4 vShape;
in vec2 vMisc;

layout(location = 0) out vec4 outColor;

const float GLYPH_ASPECT = 0.56;   // glyph advance / glyph height

// Coverage of the decimal digits of vN, centred in the dot (p is sprite-normalised, y up).
float numeral(vec2 p) {
  float D = vShape.x * 2.0;                                   // dot diameter
  float heightN = min(min(0.34, 0.8 / float(vDigits)) / GLYPH_ASPECT, 0.52) * D;
  float advance = heightN * GLYPH_ASPECT;

  float u = (p.x + 0.5 * float(vDigits) * advance) / advance;
  float v = (p.y + 0.5 * heightN) / heightN;
  int col = int(floor(u));
  float inside = float(u >= 0.0 && u < float(vDigits) && v >= 0.0 && v <= 1.0);

  int power = clamp(vDigits - 1 - col, 0, 9);
  int div = 1;
  for (int i = 0; i < power; i++) div *= 10;
  int q = vN / div;
  int digit = q - (q / 10) * 10;

  vec2 uv = vec2((float(digit) + clamp(fract(u), 0.02, 0.98)) * 0.1, 1.0 - clamp(v, 0.0, 1.0));
  float lod = max(0.0, log2(96.0 / max(heightN * 0.5 * vShape.y, 1.0)));
  return textureLod(uGlyphs, uv, lod).r * inside;
}

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y;
  float d = length(p);
  if (d > 1.0) discard;

  float dotR = max(vShape.x, 1e-3);
  float px = 2.0 / vShape.y;                                  // one device pixel, sprite-normalised
  float disc = 1.0 - smoothstep(dotR - px, dotR + px, d);

  // Hot white-ish centre on primes, plain disc on composites.
  float hot = exp(-d * d / (dotR * dotR * 0.3 + 1e-4)) * vMisc.y;
  vec3 core = vCore * disc * (1.0 + 1.0 * hot);

  // Halo: cubic falloff from the rim to the sprite edge.
  float hx = clamp((d - dotR) / max(1.0 - dotR, 1e-3), 0.0, 1.0);
  float falloff = (1.0 - hx) * (1.0 - hx) * (1.0 - hx);
  vec3 col = vHalo * falloff;

  // Diffraction cross on bright, large primes.
  if (vMisc.x > 0.0) {
    float ax = abs(p.x);
    float ay = abs(p.y);
    float spikes = exp(-ay * 38.0) * exp(-ax * 3.5) + exp(-ax * 38.0) * exp(-ay * 3.5);
    col += vHalo * vMisc.x * 0.9 * spikes * (1.0 - smoothstep(0.7, 1.0, d));
  }

  col += core;

  // Numerals: punched out of bright prime discs, added as light on dim composites.
  if (vShape.z > 0.01) {
    float m = numeral(p) * vShape.z;
    if (vMisc.y > 0.5) col *= 1.0 - 0.95 * m;
    else col += vec3(0.85, 0.92, 1.0) * m;
  }

  // Family ring.
  if (vShape.w > 0.0) {
    float ring = 1.0 - smoothstep(0.0, 1.6 * px, abs(d - vShape.w));
    col += vRing * ring;
  }

  outColor = vec4(col, 1.0);
}
