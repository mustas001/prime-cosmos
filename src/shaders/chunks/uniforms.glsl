// ---------------------------------------------------------------------------
// Uniforms shared by the draw, pick and marker vertex shaders. All three evaluate
// exactly the same layout, so the picked/marked integer is always the one on screen.
// ---------------------------------------------------------------------------

// Prime bitmask: byte (n >> 3) at texel ((n >> 3) & ROW_MASK, n >> (3 + ROW_SHIFT)).
uniform highp usampler2D uBits;
uniform int uLimit;       // largest sieved integer
uniform int uCount;       // largest integer drawn
uniform int uBase;        // n = uBase + gl_VertexID + 1 (start of the submitted window)

// Camera. Centre is split into a float-exact hi part and a small lo remainder so that
// (pos - hi) - lo stays precise even a million units from the origin.
uniform vec2 uResolution; // drawing buffer, device px
uniform vec2 uCenterHi;
uniform vec2 uCenterLo;
uniform float uScale;     // device px per world unit
uniform float uMaxPoint;  // largest gl_PointSize the GPU honours

// Topology morph: A --(uMixAB, frozen)--> B --(uTransitionProgress)--> C.
// In the steady state uTransitionProgress == 1, uMixAB == 0 and only C is evaluated.
uniform int uTopoA;
uniform int uTopoB;
uniform int uTopoC;
uniform float uMixAB;
uniform float uTransitionProgress;
uniform float uStagger;
uniform float uSwirl;

// Topology parameters.
uniform int uWidth;
uniform vec3 uAngle;
uniform float uExponent;
uniform int uModulus;

// What counts as "prime", and which family to highlight.
uniform int uField;
uniform int uFamily;
uniform int uQuadA;
uniform int uQuadB;
uniform int uQuadC;

// Sizing shared with picking so hit areas match what is drawn.
uniform float uDotScale;
uniform float uPrimeScale;
uniform float uCompScale;
uniform float uCompAlpha;
