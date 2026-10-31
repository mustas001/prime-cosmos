/**
 * Layout constants shared by the CPU mirror (topologies.ts) and injected into the GLSL
 * (shaders/index.ts), so the two implementations cannot drift apart.
 */

export const SQRT3_2 = Math.sqrt(3) / 2;

/** r = C·√n places exactly one point per unit of area, matching the unit-pitch lattices. */
export const RADIAL_C = 1 / Math.sqrt(Math.PI);

/** Row pitch of the triangular lattices (pyramid, hex spiral). */
export const TRI_DY = SQRT3_2;

/** 360°/φ² — the golden angle. */
export const GOLDEN_ANGLE_DEG = 360 / ((1 + Math.sqrt(5)) / 2) ** 2;

/** The prime bitmask is uploaded as a texture this many bytes wide (2^BITS_ROW_SHIFT). */
export const BITS_ROW_SHIFT = 11;
export const BITS_ROW_WIDTH = 1 << BITS_ROW_SHIFT;

/** Largest integer count the renderer will draw. */
export const MAX_COUNT = 10_000_000;
