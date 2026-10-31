import { describe, expect, it } from 'vitest';
import { RADIAL_C, TRI_DY } from '../src/topology/constants';
import {
  TOPOLOGIES,
  getTopology,
  hexCoord,
  hilbertCoord,
  isqrt,
  mortonCoord,
  peanoCoord,
  ulamCoord,
  type Rect,
  type TopologyParams,
} from '../src/topology/topologies';

const PARAMS: TopologyParams = { width: 30, angleDeg: 137.50776405003785, exponent: 0.5, modulus: 30 };

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

describe('isqrt', () => {
  it('is exact around perfect squares', () => {
    for (const m of [1, 2, 7, 1000, 3162, 31622]) {
      expect(isqrt(m * m)).toBe(m);
      expect(isqrt(m * m - 1)).toBe(m - 1);
      expect(isqrt(m * m + 1)).toBe(m);
    }
  });
});

describe('Ulam spiral', () => {
  it('starts 1:(0,0) 2:(1,0) 3:(1,1) 4:(0,1) 5:(-1,1) … 9:(1,-1) 10:(2,-1)', () => {
    const expected = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [2, -1]];
    expected.forEach(([x, y], i) => expect(ulamCoord(i + 1)).toEqual([x, y]));
  });

  it('is a continuous path that never revisits a site', () => {
    const seen = new Set<string>();
    let prev = ulamCoord(1);
    seen.add(prev.join());
    for (let n = 2; n <= 20_000; n++) {
      const cur = ulamCoord(n);
      expect(Math.abs(cur[0] - prev[0]) + Math.abs(cur[1] - prev[1])).toBe(1);
      expect(seen.has(cur.join())).toBe(false);
      seen.add(cur.join());
      prev = cur;
    }
  });

  it('puts odd squares on the lower-right diagonal', () => {
    for (let k = 1; k < 50; k++) expect(ulamCoord((2 * k + 1) ** 2)).toEqual([k, -k]);
  });
});

describe('Hex spiral', () => {
  const cart = (n: number) => {
    const [q, r] = hexCoord(n);
    return [q + r / 2, r * TRI_DY];
  };

  it('is a continuous path of unit steps that never revisits a site', () => {
    const seen = new Set<string>([hexCoord(1).join()]);
    let prev = cart(1);
    for (let n = 2; n <= 30_000; n++) {
      const cur = cart(n);
      expect(Math.hypot(cur[0] - prev[0], cur[1] - prev[1])).toBeCloseTo(1, 9);
      const key = hexCoord(n).join();
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      prev = cur;
    }
  });

  it('has 6k integers on ring k', () => {
    for (let k = 1; k < 40; k++) {
      const first = 3 * k * (k - 1) + 2;
      const last = 3 * k * (k + 1) + 1;
      expect(last - first + 1).toBe(6 * k);
      for (const n of [first, last]) {
        const [q, r] = hexCoord(n);
        expect(Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))).toBe(k);
      }
    }
  });
});

describe('other layouts', () => {
  it('Sacks puts perfect squares on the positive x axis', () => {
    const sacks = getTopology('sacks');
    for (const m of [1, 2, 10, 100, 1000]) {
      const [x, y] = sacks.position(m * m, PARAMS);
      expect(x).toBeCloseTo(RADIAL_C * m, 9);
      expect(Math.abs(y)).toBeLessThan(1e-9);
    }
  });

  it('Pyramid row r holds r+1 integers, centred', () => {
    const pyramid = getTopology('pyramid');
    // Row 3 (0-based) is n = 7..10.
    const row = [7, 8, 9, 10].map((n) => pyramid.position(n, PARAMS));
    expect(new Set(row.map(([, y]) => y)).size).toBe(1);
    expect(row.map(([x]) => x)).toEqual([-1.5, -0.5, 0.5, 1.5]);
    const [ax, ay] = pyramid.position(1, PARAMS);
    expect(ax).toBeCloseTo(0, 12);
    expect(ay).toBeCloseTo(0, 12);
  });

  it('Matrix wraps at the configured width and is horizontally centred', () => {
    const matrix = getTopology('matrix');
    const p = { ...PARAMS, width: 5 };
    expect(matrix.position(1, p)).toEqual([-2, -0]);
    expect(matrix.position(5, p)).toEqual([2, -0]);
    expect(matrix.position(6, p)).toEqual([-2, -1]);
  });

  it('Modular clock puts residue 0 at 12 o’clock and spreads residues evenly', () => {
    const clock = getTopology('clock');
    const [x, y] = clock.position(30, PARAMS);
    expect(Math.abs(x)).toBeLessThan(1e-9);
    expect(y).toBeGreaterThan(0);
    const a = clock.position(1001, PARAMS);
    const b = clock.position(1031, PARAMS); // same residue mod 30 → same spoke
    expect(Math.atan2(a[1], a[0])).toBeCloseTo(Math.atan2(b[1], b[0]), 9);
  });
});

describe('space-filling curves', () => {
  const curves = [
    { name: 'Hilbert', cell: hilbertCoord, side: 2, levels: 6 },
    { name: 'Peano', cell: peanoCoord, side: 3, levels: 4 },
  ];

  for (const { name, cell, side, levels } of curves) {
    it(`${name}: consecutive integers are edge-adjacent cells`, () => {
      let prev = cell(1);
      expect(prev).toEqual([0, 0]);
      for (let n = 2; n <= 60_000; n++) {
        const cur = cell(n);
        expect(Math.abs(cur[0] - prev[0]) + Math.abs(cur[1] - prev[1])).toBe(1);
        prev = cur;
      }
    });

    it(`${name}: every aligned block of ${side * side}^k integers tiles a ${side}^k square anchored at the origin`, () => {
      for (let k = 1; k <= levels; k++) {
        const span = side ** k;
        const seen = new Set<number>();
        for (let n = 1; n <= span * span; n++) {
          const [x, y] = cell(n);
          expect(x).toBeLessThan(span);
          expect(y).toBeLessThan(span);
          seen.add(y * span + x);
        }
        expect(seen.size).toBe(span * span); // a bijection onto the square
      }
    });
  }

  it('Hilbert and Peano handle the largest drawable integer inside their grids', () => {
    for (const n of [9_999_999, 10_000_000]) {
      const [hx, hy] = hilbertCoord(n);
      expect(hx).toBeLessThan(4096);
      expect(hy).toBeLessThan(4096);
      const [px, py] = peanoCoord(n);
      expect(px).toBeLessThan(6561);
      expect(py).toBeLessThan(6561);
    }
  });

  it('Z-order interleaves bits: x from even bits of n-1, y from odd bits', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(mortonCoord)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [3, 0], [2, 1], [3, 1]]);
    // Every prime > 2 is odd, so n-1 is even and x is even: odd columns hold no primes.
    for (const n of [3, 5, 7, 11, 13, 97, 1009, 10007]) expect(mortonCoord(n)[0] % 2).toBe(0);
  });
});

describe('grid variants', () => {
  it('Serpentine rows alternate direction and every integer touches the next', () => {
    const serpentine = getTopology('serpentine');
    const p = { ...PARAMS, width: 5 };
    expect([1, 5, 6, 10, 11].map((n) => serpentine.position(n, p)[0])).toEqual([-2, 2, 2, -2, -2]);
    let prev = serpentine.position(1, p);
    for (let n = 2; n <= 5000; n++) {
      const cur = serpentine.position(n, p);
      expect(Math.abs(cur[0] - prev[0]) + Math.abs(cur[1] - prev[1])).toBe(1);
      prev = cur;
    }
  });

  it('Cantor diagonals walk each anti-diagonal and hand over to the next without a jump', () => {
    const cantor = getTopology('cantor');
    expect(cantor.position(1, PARAMS)).toEqual([0, -0]);
    let prev = cantor.position(1, PARAMS);
    for (let n = 2; n <= 20_000; n++) {
      const cur = cantor.position(n, PARAMS);
      expect(Math.max(Math.abs(cur[0] - prev[0]), Math.abs(cur[1] - prev[1]))).toBe(1);
      prev = cur;
    }
    // Diagonal d = 3 holds n = 7..10 and every point on it has x + |y| = 3.
    for (const n of [7, 8, 9, 10]) {
      const [x, y] = cantor.position(n, PARAMS);
      expect(x - y).toBe(3);
    }
  });
});

describe('window() is conservative', () => {
  // The contract: every n whose position lies in `rect` grown by `margin` must be inside [lo, hi].
  const COUNT = 25_000;
  const random = rng(7);

  for (const topology of TOPOLOGIES) {
    it(`${topology.id}`, () => {
      const bounds = topology.bounds(COUNT, PARAMS);
      const spanX = bounds.x1 - bounds.x0 + 4;
      const spanY = bounds.y1 - bounds.y0 + 4;
      const positions = Array.from({ length: COUNT }, (_, i) => topology.position(i + 1, PARAMS));

      for (let trial = 0; trial < 120; trial++) {
        const w = spanX * Math.pow(random(), 2.5) + 0.5;
        const h = spanY * Math.pow(random(), 2.5) + 0.5;
        const cx = bounds.x0 - 2 + random() * spanX;
        const cy = bounds.y0 - 2 + random() * spanY;
        const rect: Rect = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
        const margin = random() * 3;
        const [lo, hi] = topology.window(rect, margin, COUNT, PARAMS);

        for (let n = 1; n <= COUNT; n++) {
          const [x, y] = positions[n - 1];
          const inside = x >= rect.x0 - margin && x <= rect.x1 + margin && y >= rect.y0 - margin && y <= rect.y1 + margin;
          if (inside && (n < lo || n > hi)) {
            throw new Error(`${topology.id}: n=${n} at (${x.toFixed(2)}, ${y.toFixed(2)}) is visible but outside window [${lo}, ${hi}]`);
          }
        }
      }
    });
  }

  it('shrinks to a small window when zoomed in on a spiral', () => {
    const [lo, hi] = getTopology('ulam').window({ x0: 99, x1: 101, y0: 99, y1: 101 }, 1, 10_000_000, PARAMS);
    // Seven spiral rings out of ten million integers.
    expect(hi - lo).toBeLessThan(10_000);
  });
});

describe('bounds()', () => {
  for (const topology of TOPOLOGIES) {
    it(`${topology.id} contains every position`, () => {
      const count = 20_000;
      const b = topology.bounds(count, PARAMS);
      for (let n = 1; n <= count; n++) {
        const [x, y] = topology.position(n, PARAMS);
        expect(x).toBeGreaterThanOrEqual(b.x0 - 1e-6);
        expect(x).toBeLessThanOrEqual(b.x1 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(b.y0 - 1e-6);
        expect(y).toBeLessThanOrEqual(b.y1 + 1e-6);
      }
    });
  }
});
