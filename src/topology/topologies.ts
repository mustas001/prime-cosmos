import { RADIAL_C, TRI_DY } from './constants';

/**
 * Double-precision CPU mirror of the GLSL topologies in shaders/chunks/topologies.glsl.
 *
 * The GPU is the source of truth for what is drawn; this mirror exists for the jobs that
 * must happen on the CPU: choosing which integer window to submit for the current
 * viewport, framing the camera, and flying to a given integer. tests/topologies.test.ts
 * checks the window logic, and the browser parity check picks integers back off the GPU.
 *
 * Integers n are 1-based; n = 1 sits at (or next to) the origin in every layout.
 */

export type TopologyId =
  | 'matrix'
  | 'pyramid'
  | 'ulam'
  | 'sacks'
  | 'phyllotaxis'
  | 'hex'
  | 'clock'
  | 'serpentine'
  | 'cantor'
  | 'hilbert'
  | 'peano'
  | 'morton';

export interface TopologyParams {
  /** Matrix row width. */
  width: number;
  /** Phyllotaxis divergence angle in degrees. */
  angleDeg: number;
  /** Phyllotaxis radial exponent: r = C·n^exponent. */
  exponent: number;
  /** Modular clock modulus. */
  modulus: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Vec2 = readonly [number, number];

export interface Topology {
  id: TopologyId;
  /** Index used by the shader's topoPos() dispatch. */
  glsl: number;
  label: string;
  tagline: string;
  position(n: number, p: TopologyParams): Vec2;
  /**
   * Inclusive integer window [lo, hi] guaranteed to contain every n whose position lies in
   * `rect` grown by `margin` (world units). `lo > hi` means nothing is visible.
   */
  window(rect: Rect, margin: number, count: number, p: TopologyParams): [number, number];
  /** World-space bounds of the integers 1..count. */
  bounds(count: number, p: TopologyParams): Rect;
}

export const TAU = Math.PI * 2;

export function isqrt(n: number): number {
  let s = Math.floor(Math.sqrt(n));
  while (s * s > n) s--;
  while ((s + 1) * (s + 1) <= n) s++;
  return s;
}

/** Ulam spiral lattice coordinates (right, up, left, down; 1 at the origin). */
export function ulamCoord(n: number): [number, number] {
  if (n <= 1) return [0, 0];
  const k = Math.floor((isqrt(n - 1) + 1) / 2);
  const o = n - (2 * k - 1) ** 2 - 1; // 0 .. 8k-1
  const side = Math.floor(o / (2 * k));
  const t = o - side * 2 * k;
  switch (side) {
    case 0:
      return [k, -k + 1 + t];
    case 1:
      return [k - 1 - t, k];
    case 2:
      return [-k, k - 1 - t];
    default:
      return [-k + 1 + t, -k];
  }
}

/** Hexagonal spiral, axial coordinates (q, r); cartesian x = q + r/2, y = r·√3/2. */
export function hexCoord(n: number): [number, number] {
  if (n <= 1) return [0, 0];
  const m = n - 2;
  let k = Math.floor((3 + Math.sqrt(9 + 12 * m)) / 6);
  while (3 * k * (k - 1) > m) k--;
  while (3 * k * (k + 1) <= m) k++;
  let o = m - 3 * k * (k - 1); // 0 .. 6k-1
  if (o < k) return [k, 1 - k + o];
  o -= k;
  const side = Math.floor(o / k);
  const t = o - side * k + 1;
  switch (side) {
    case 0:
      return [k - t, t];
    case 1:
      return [-t, k];
    case 2:
      return [-k, k - t];
    case 3:
      return [-k + t, -t];
    default:
      return [t, -k];
  }
}

function hexPosition(n: number): Vec2 {
  const [q, r] = hexCoord(n);
  return [q + r / 2, r * TRI_DY];
}

/** Distances from the origin to the nearest point and farthest corner of `rect` grown by `m`. */
function radii(rect: Rect, m: number): [number, number] {
  const x0 = rect.x0 - m;
  const x1 = rect.x1 + m;
  const y0 = rect.y0 - m;
  const y1 = rect.y1 + m;
  const dx = x0 > 0 ? x0 : x1 < 0 ? -x1 : 0;
  const dy = y0 > 0 ? y0 : y1 < 0 ? -y1 : 0;
  return [Math.hypot(dx, dy), Math.hypot(Math.max(-x0, x1), Math.max(-y0, y1))];
}

/** Window for layouts whose radius grows monotonically with n: r(n) = rOf(n). */
function radialWindow(
  rect: Rect,
  margin: number,
  count: number,
  nOf: (r: number) => number,
): [number, number] {
  const [rMin, rMax] = radii(rect, margin);
  const lo = Math.max(1, Math.floor(nOf(rMin)) - 1);
  const hi = Math.min(count, Math.ceil(nOf(rMax)) + 1);
  return [lo, hi];
}

const clampWindow = (lo: number, hi: number, count: number): [number, number] => [
  Math.max(1, lo),
  Math.min(count, hi),
];

const radialPos = (r: number, a: number): Vec2 => [r * Math.cos(a), r * Math.sin(a)];
const square = (r: number): Rect => ({ x0: -r, y0: -r, x1: r, y1: r });

/** frac(n·g) — double precision is plenty here; the GPU uses a fixed-point equivalent. */
const frac = (x: number) => x - Math.floor(x);


/** Hilbert curve order: a 2^12 × 2^12 grid, enough for MAX_COUNT. Fixed so layouts never reshuffle with count. */
export const HILBERT_ORDER = 12;
/** Peano curve levels: a 3^8 × 3^8 grid. */
export const PEANO_LEVELS = 8;

/** Hilbert curve cell for integer n (the standard iterative d2xy; n = 1 at the origin). */
export function hilbertCoord(n: number): [number, number] {
  let t = n - 1;
  let x = 0;
  let y = 0;
  for (let s = 1; s < 1 << HILBERT_ORDER; s <<= 1) {
    const rx = 1 & (t >> 1);
    const ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      [x, y] = [y, x];
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return [x, y];
}

/**
 * Peano curve cell. Each base-9 digit picks one of 3×3 sub-blocks, visited column by column
 * (up, down, up). A sub-block is a reflected copy of the whole curve — mirrored in x when it
 * sits in the middle row, in y when it sits in an odd column — so exits meet entrances; the
 * reflections accumulate by XOR down the levels.
 */
export function peanoCoord(n: number): [number, number] {
  const t = n - 1;
  let p = 9 ** (PEANO_LEVELS - 1);
  let x = 0;
  let y = 0;
  let flipX = 0;
  let flipY = 0;
  for (let i = 0; i < PEANO_LEVELS; i++) {
    const b = Math.floor(t / p) % 9;
    const c = Math.floor(b / 3);
    const q = b - 3 * c;
    const row = (c & 1) === 0 ? q : 2 - q;
    x = x * 3 + (flipX ? 2 - c : c);
    y = y * 3 + (flipY ? 2 - row : row);
    flipX ^= row & 1;
    flipY ^= c & 1;
    p /= 9;
  }
  return [x, y];
}

const compactBits = (v: number) => {
  v &= 0x55555555;
  v = (v | (v >> 1)) & 0x33333333;
  v = (v | (v >> 2)) & 0x0f0f0f0f;
  v = (v | (v >> 4)) & 0x00ff00ff;
  v = (v | (v >> 8)) & 0x0000ffff;
  return v;
};

/** Z-order (Morton) cell: even bits of n-1 are x, odd bits are y. */
export function mortonCoord(n: number): [number, number] {
  const d = n - 1;
  return [compactBits(d), compactBits(d >> 1)];
}

/**
 * Window for a self-similar space-filling curve whose aligned blocks of (side²)^L integers
 * are exactly side^L × side^L squares (Hilbert and Morton with side 2, Peano with side 3).
 * Descends the block tree, pruning blocks outside the rect and taking blocks that are inside —
 * or no larger than ~1/12 of the rect, which keeps the walk to a few hundred nodes — whole.
 */
function curveWindow(
  rect: Rect,
  margin: number,
  count: number,
  side: number,
  cell: (n: number) => Vec2,
): [number, number] {
  const branch = side * side;
  const x0 = rect.x0 - margin;
  const x1 = rect.x1 + margin;
  const y0 = rect.y0 - margin;
  const y1 = rect.y1 + margin;
  const grain = Math.max(1, Math.min(x1 - x0, y1 - y0) / 12);

  let top = 0;
  for (let size = 1; size < count; size *= branch) top++;

  let lo = Infinity;
  let hi = -Infinity;
  const visit = (start: number, level: number, span: number, blockSize: number): void => {
    if (start > count) return;
    const [cx, cy] = cell(start);
    const ox = Math.floor(cx / span) * span - 0.5; // cells are centred on integers
    const oy = Math.floor(cy / span) * span - 0.5;
    if (ox > x1 || ox + span < x0 || oy > y1 || oy + span < y0) return;

    const inside = ox >= x0 && ox + span <= x1 && oy >= y0 && oy + span <= y1;
    if (level === 0 || inside || span <= grain) {
      lo = Math.min(lo, start);
      hi = Math.max(hi, Math.min(count, start + blockSize - 1));
      return;
    }
    const childSize = blockSize / branch;
    for (let k = 0; k < branch; k++) visit(start + k * childSize, level - 1, span / side, childSize);
  };
  visit(1, top, side ** top, branch ** top);
  return lo === Infinity ? [1, 0] : [lo, hi];
}

/** The curves start at the origin and every prefix block is a square anchored there. */
function curveBounds(count: number, side: number): Rect {
  let span = 1;
  for (let size = 1; size < count; size *= side * side) span *= side;
  return { x0: 0, y0: 0, x1: span - 1, y1: span - 1 };
}

const matrix: Topology = {
  id: 'matrix',
  glsl: 0,
  label: 'Matrix',
  tagline: 'Rows of W consecutive integers — columns expose modular structure.',
  position(n, p) {
    const m = n - 1;
    const row = Math.floor(m / p.width);
    return [m - row * p.width - (p.width - 1) / 2, -row];
  },
  window(rect, margin, count, p) {
    const half = (p.width - 1) / 2 + margin;
    if (rect.x1 < -half || rect.x0 > half) return [1, 0];
    const rowLo = Math.max(0, Math.floor(-(rect.y1 + margin)));
    const rowHi = Math.ceil(-(rect.y0 - margin));
    return clampWindow(rowLo * p.width + 1, (rowHi + 1) * p.width, count);
  },
  bounds(count, p) {
    const w = Math.min(p.width, count);
    const rows = Math.ceil(count / p.width);
    return { x0: -(w - 1) / 2, x1: (w - 1) / 2, y0: -(rows - 1), y1: 0 };
  },
};

const pyramid: Topology = {
  id: 'pyramid',
  glsl: 1,
  label: 'Pyramid',
  tagline: 'Row k holds k integers; the apex is 1 and the triangle grows downward.',
  position(n) {
    const m = n - 1;
    const r = Math.floor((isqrt(8 * m + 1) - 1) / 2);
    const c = m - (r * (r + 1)) / 2;
    return [c - r / 2, -r * TRI_DY];
  },
  window(rect, margin, count) {
    const rowLo = Math.max(0, Math.floor(-(rect.y1 + margin) / TRI_DY) - 1);
    const rowHi = Math.ceil(-(rect.y0 - margin) / TRI_DY) + 1;
    return clampWindow((rowLo * (rowLo + 1)) / 2 + 1, ((rowHi + 1) * (rowHi + 2)) / 2, count);
  },
  bounds(count) {
    const r = Math.floor((isqrt(8 * (count - 1) + 1) - 1) / 2);
    return { x0: -r / 2, x1: r / 2, y0: -r * TRI_DY, y1: 0 };
  },
};

const ulam: Topology = {
  id: 'ulam',
  glsl: 2,
  label: 'Ulam spiral',
  tagline: 'A square spiral from 1 — primes gather on diagonals.',
  position(n) {
    return ulamCoord(n);
  },
  window(rect, margin, count) {
    const x0 = rect.x0 - margin;
    const x1 = rect.x1 + margin;
    const y0 = rect.y0 - margin;
    const y1 = rect.y1 + margin;
    const dx = x0 > 0 ? x0 : x1 < 0 ? -x1 : 0;
    const dy = y0 > 0 ? y0 : y1 < 0 ? -y1 : 0;
    // Ring k of the spiral is exactly the set of points with Chebyshev radius k.
    const kLo = Math.max(0, Math.floor(Math.max(dx, dy)) - 1);
    const kHi = Math.ceil(Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1))) + 1;
    return clampWindow(kLo === 0 ? 1 : (2 * kLo - 1) ** 2 + 1, (2 * kHi + 1) ** 2, count);
  },
  bounds(count) {
    return square(Math.floor((isqrt(count - 1) + 1) / 2));
  },
};

const sacks: Topology = {
  id: 'sacks',
  glsl: 3,
  label: 'Sacks spiral',
  tagline: 'r = √n, θ = 2π√n — perfect squares line up on the horizontal axis.',
  position(n) {
    const s = isqrt(n);
    const root = Math.sqrt(n);
    const f = (n - s * s) / (root + s);
    return radialPos(RADIAL_C * root, TAU * f);
  },
  window: (rect, margin, count) => radialWindow(rect, margin, count, (r) => (r / RADIAL_C) ** 2),
  bounds: (count) => square(RADIAL_C * Math.sqrt(count)),
};

const phyllotaxis: Topology = {
  id: 'phyllotaxis',
  glsl: 4,
  label: 'Phyllotaxis',
  tagline: 'Golden-angle packing, as in a sunflower head. Tune the angle and exponent.',
  position(n, p) {
    return radialPos(RADIAL_C * n ** p.exponent, TAU * frac((n * p.angleDeg) / 360));
  },
  window: (rect, margin, count, p) =>
    radialWindow(rect, margin, count, (r) => (r / RADIAL_C) ** (1 / p.exponent)),
  bounds: (count, p) => square(RADIAL_C * count ** p.exponent),
};

const hex: Topology = {
  id: 'hex',
  glsl: 5,
  label: 'Hex spiral',
  tagline: 'A spiral on the triangular lattice; ring k holds 6k integers.',
  position(n) {
    return hexPosition(n);
  },
  window(rect, margin, count) {
    const [rMin, rMax] = radii(rect, margin);
    // A point on ring k lies between k·√3/2 and k from the origin.
    const kLo = Math.max(0, Math.floor(rMin) - 1);
    const kHi = Math.ceil(rMax / TRI_DY) + 1;
    return clampWindow(kLo === 0 ? 1 : 3 * kLo * (kLo - 1) + 2, 3 * kHi * (kHi + 1) + 1, count);
  },
  bounds(count) {
    const m = count - 2;
    let k = count <= 1 ? 0 : Math.floor((3 + Math.sqrt(9 + 12 * m)) / 6);
    while (k > 0 && 3 * k * (k - 1) > m) k--;
    return { x0: -k, x1: k, y0: -k * TRI_DY, y1: k * TRI_DY };
  },
};

const clock: Topology = {
  id: 'clock',
  glsl: 6,
  label: 'Modular clock',
  tagline: 'Angle = n mod m on a clock face, radius = √n — only coprime spokes hold primes.',
  position(n, p) {
    const k = n % p.modulus;
    return radialPos(RADIAL_C * Math.sqrt(n), Math.PI / 2 - (TAU * k) / p.modulus);
  },
  window: (rect, margin, count) => radialWindow(rect, margin, count, (r) => (r / RADIAL_C) ** 2),
  bounds: (count) => square(RADIAL_C * Math.sqrt(count)),
};


const serpentine: Topology = {
  id: 'serpentine',
  glsl: 7,
  label: 'Serpentine',
  tagline: 'The matrix, but every other row runs backwards — each integer touches the next, and columns become chevrons.',
  position(n, p) {
    const m = n - 1;
    const row = Math.floor(m / p.width);
    let col = m - row * p.width;
    if (row & 1) col = p.width - 1 - col;
    return [col - (p.width - 1) / 2, -row];
  },
  window: matrix.window,
  bounds: matrix.bounds,
};

const cantor: Topology = {
  id: 'cantor',
  glsl: 8,
  label: 'Cantor diagonals',
  tagline: 'Anti-diagonals of a square grid, zig-zagging — the classic proof that the plane is countable.',
  position(n) {
    const m = n - 1;
    const d = Math.floor((isqrt(8 * m + 1) - 1) / 2);
    let k = m - (d * (d + 1)) / 2;
    if (d & 1) k = d - k;
    return [k, -(d - k)];
  },
  window(rect, margin, count) {
    // A point on diagonal d sits at x ≥ 0, y ≤ 0 with x + |y| = d.
    const xHi = rect.x1 + margin;
    const yHi = -(rect.y0 - margin);
    if (xHi < 0 || yHi < 0) return [1, 0];
    const xLo = Math.max(0, rect.x0 - margin);
    const yLo = Math.max(0, -(rect.y1 + margin));
    const dLo = Math.max(0, Math.floor(xLo + yLo) - 1);
    const dHi = Math.ceil(xHi + yHi) + 1;
    return clampWindow((dLo * (dLo + 1)) / 2 + 1, ((dHi + 1) * (dHi + 2)) / 2, count);
  },
  bounds(count) {
    const d = Math.floor((isqrt(8 * (count - 1) + 1) - 1) / 2);
    return { x0: 0, x1: d, y0: -d, y1: 0 };
  },
};

const hilbert: Topology = {
  id: 'hilbert',
  glsl: 9,
  label: 'Hilbert curve',
  tagline: 'A space-filling curve: integers close in value stay close on screen, at every scale.',
  position: (n) => hilbertCoord(n),
  window: (rect, margin, count) => curveWindow(rect, margin, count, 2, hilbertCoord),
  bounds: (count) => curveBounds(count, 2),
};

const peano: Topology = {
  id: 'peano',
  glsl: 10,
  label: 'Peano curve',
  tagline: 'The base-3 cousin of Hilbert: a 3×3 serpentine repeated inside itself.',
  position: (n) => peanoCoord(n),
  window: (rect, margin, count) => curveWindow(rect, margin, count, 3, peanoCoord),
  bounds: (count) => curveBounds(count, 3),
};

const morton: Topology = {
  id: 'morton',
  glsl: 11,
  label: 'Z-order curve',
  tagline: 'Interleave the bits of n into x and y. Every prime is odd, so whole columns stay empty.',
  position: (n) => mortonCoord(n),
  window: (rect, margin, count) => curveWindow(rect, margin, count, 2, mortonCoord),
  bounds: (count) => curveBounds(count, 2),
};

/** Order is the dropdown order; the first ten get the number keys 1–9, 0. */
export const TOPOLOGIES: readonly Topology[] = [
  ulam,
  sacks,
  phyllotaxis,
  hex,
  clock,
  matrix,
  pyramid,
  hilbert,
  peano,
  morton,
  serpentine,
  cantor,
];

const byId = new Map(TOPOLOGIES.map((t) => [t.id, t]));
export function getTopology(id: TopologyId): Topology {
  return byId.get(id)!;
}

/** sqrt(area per point) near integer n — mirrors topoMetrics().x in the shader. */
export function spacingAt(id: TopologyId, n: number, p: TopologyParams): number {
  switch (id) {
    case 'pyramid':
    case 'hex':
      return Math.sqrt(TRI_DY);
    case 'phyllotaxis':
      return RADIAL_C * Math.sqrt(TAU * p.exponent) * n ** (p.exponent - 0.5);
    default:
      return 1;
  }
}

/**
 * How many integers the default camera framing should cover. Layouts whose radius grows
 * faster than √n (phyllotaxis with a large exponent) would otherwise frame a huge,
 * almost empty disc.
 */
export function framingCount(id: TopologyId, count: number, p: TopologyParams): number {
  if (id === 'phyllotaxis' && p.exponent > 0.7) return Math.min(count, 30_000);
  return count;
}
