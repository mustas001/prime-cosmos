uniform vec3 uMarkerColor;
uniform float uMarkerAlpha;
uniform float uMarkerSpin;    // 0: solid ring (hover)   1: rotating dashes + ticks (selection)
uniform float uTime;

in float vSizePx;
in float vDotFrac;

layout(location = 0) out vec4 outColor;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y;
  float d = length(p);
  if (d > 1.0) discard;

  float px = 2.0 / vSizePx;
  float radius = max(vDotFrac * 1.35, 0.5);
  float ring = 1.0 - smoothstep(0.0, 1.5 * px, abs(d - radius));

  float a = atan(p.y, p.x);
  float dashes = mix(1.0, smoothstep(-0.2, 0.3, sin(a * 10.0 - uTime * 1.6)), uMarkerSpin);
  float ticks = 0.0;
  if (uMarkerSpin > 0.5) {
    float ax = abs(p.x);
    float ay = abs(p.y);
    float axes = step(ay, px) + step(ax, px);
    ticks = axes * smoothstep(radius + 6.0 * px, radius + 7.0 * px, d) * (1.0 - smoothstep(0.78, 0.98, d));
  }

  float v = ring * dashes + ticks * 0.8;
  outColor = vec4(uMarkerColor * v * uMarkerAlpha, 1.0);
}
