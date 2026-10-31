// Final grade, applied after tone mapping (display-referred): vignette, a faint
// deep-space gradient, and dithering so dark bloom gradients don't band.
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uVignette;
uniform float uSeed;

varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;

  vec2 q = vUv - 0.5;
  q.x *= uResolution.x / uResolution.y;
  float r = length(q);

  c += vec3(0.006, 0.008, 0.020) * smoothstep(1.1, 0.0, r);           // lifted blue core
  c *= mix(1.0, smoothstep(1.35, 0.25, r), uVignette);
  c += (hash12(gl_FragCoord.xy + uSeed) - 0.5) * (1.6 / 255.0);       // dither

  gl_FragColor = vec4(c, 1.0);
}
