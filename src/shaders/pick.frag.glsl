flat in int vN;

layout(location = 0) out vec4 outColor;

// The integer id, little-endian across RGBA8. A cleared target decodes to 0 = "nothing".
void main() {
  outColor = vec4(
    float(vN & 255),
    float((vN >> 8) & 255),
    float((vN >> 16) & 255),
    float((vN >> 24) & 255)
  ) / 255.0;
}
