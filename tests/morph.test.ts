import { describe, expect, it } from 'vitest';
import { MorphTimeline } from '../src/scene/MorphTimeline';

const ULAM = 2;
const SACKS = 3;
const HEX = 5;

describe('MorphTimeline', () => {
  it('starts idle on the initial topology', () => {
    const m = new MorphTimeline(ULAM);
    expect(m.active).toBe(false);
    expect(m.progress).toBe(1);
    expect([m.a, m.b, m.c, m.mixAB]).toEqual([ULAM, ULAM, ULAM, 0]);
  });

  it('ignores a request for the topology it is already heading to', () => {
    const m = new MorphTimeline(ULAM);
    expect(m.start(ULAM, 1, 'silk')).toBe(false);
    expect(m.start(SACKS, 1, 'silk')).toBe(true);
    expect(m.start(SACKS, 1, 'silk')).toBe(false);
  });

  it('runs a simple morph to completion and settles all stages on the target', () => {
    const m = new MorphTimeline(ULAM);
    m.start(SACKS, 1, 'silk');
    expect(m.active).toBe(true);
    expect([m.a, m.c, m.progress, m.mixAB]).toEqual([ULAM, SACKS, 0, 0]);

    m.update(0.4);
    expect(m.progress).toBeCloseTo(0.4, 6);
    expect(m.active).toBe(true);

    m.update(0.7);
    expect(m.active).toBe(false);
    expect([m.a, m.b, m.c, m.progress, m.mixAB]).toEqual([SACKS, SACKS, SACKS, 1, 0]);
  });

  it('retargeting mid-flight freezes the in-flight blend as a new source (no snap)', () => {
    const m = new MorphTimeline(ULAM);
    m.start(SACKS, 1, 'silk');
    m.update(0.5);

    m.start(HEX, 2, 'silk');
    // Ulam →(frozen at 0.5)→ Sacks → Hex, restarting the final stage from 0.
    expect([m.a, m.b, m.c]).toEqual([ULAM, SACKS, HEX]);
    expect(m.mixAB).toBeCloseTo(0.5, 6);
    expect(m.progress).toBe(0);
    expect(m.active).toBe(true);

    m.update(2.1);
    expect([m.a, m.b, m.c, m.progress, m.mixAB]).toEqual([HEX, HEX, HEX, 1, 0]);
  });

  it('a third retarget while two stages deep collapses to the nearer endpoint', () => {
    const m = new MorphTimeline(ULAM);
    m.start(SACKS, 1, 'silk');
    m.update(0.5);
    m.start(HEX, 1, 'silk'); // two stages deep
    m.update(0.7); // progress 0.7 → closer to the hex end

    m.start(ULAM, 1, 'silk');
    expect(m.mixAB).toBe(0);
    expect(m.a).toBe(HEX);
    expect(m.c).toBe(ULAM);
  });

  it('every easing hits exactly 0 and 1 at the ends and is monotone', () => {
    for (const easing of ['silk', 'cubic', 'expo'] as const) {
      const m = new MorphTimeline(ULAM);
      m.start(SACKS, 1, easing);
      let previous = 0;
      for (let i = 0; i < 99; i++) {
        m.update(0.01);
        expect(m.progress).toBeGreaterThanOrEqual(previous - 1e-12);
        previous = m.progress;
      }
      m.update(0.05);
      expect(m.progress).toBe(1);
    }
  });

  it('snap() jumps straight to the finished state', () => {
    const m = new MorphTimeline(ULAM);
    m.start(SACKS, 1, 'silk');
    m.update(0.3);
    m.snap(HEX);
    expect(m.active).toBe(false);
    expect([m.a, m.b, m.c, m.progress, m.mixAB]).toEqual([HEX, HEX, HEX, 1, 0]);
  });
});
