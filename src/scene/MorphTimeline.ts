/**
 * Drives the topology-morph uniforms.
 *
 * The shader can blend two stages in a chain: A --(mixAB, frozen)--> B --(progress)--> C.
 * Normally B is unused. When the user picks a new layout mid-flight, the in-flight stage is
 * frozen at its current value (A→B) and a fresh stage starts toward the new target, so the
 * cloud keeps moving smoothly from wherever it currently is instead of snapping.
 */

export type EasingId = 'silk' | 'cubic' | 'expo';

const EASINGS: Record<EasingId, (t: number) => number> = {
  // The shader already applies a per-point smootherstep, so "silk" feeds it linear time.
  silk: (t) => t,
  cubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  expo: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
};

export class MorphTimeline {
  /** GLSL topology ids for the three stages. */
  a: number;
  b: number;
  c: number;
  /** Frozen blend of stage A→B in [0, 1); 0 means B is unused. */
  mixAB = 0;
  /** uTransitionProgress: blend of (A→B) toward C. 1 means the morph is finished. */
  progress = 1;

  private t = 1;
  private duration = 1.6;
  private easing: EasingId = 'silk';

  constructor(initial: number) {
    this.a = this.b = this.c = initial;
  }

  get active(): boolean {
    return this.progress < 1 || this.mixAB > 0;
  }

  get target(): number {
    return this.c;
  }

  /** Begin morphing toward `target`; returns false if it is already the target. */
  start(target: number, durationSec: number, easing: EasingId): boolean {
    if (target === this.c) return false;
    this.duration = Math.max(0.05, durationSec);
    this.easing = easing;

    if (!this.active) {
      this.a = this.c;
      this.mixAB = 0;
    } else if (this.mixAB === 0) {
      // Freeze the in-flight A→C blend and treat it as the new source.
      this.b = this.c;
      this.mixAB = this.progress;
    } else {
      // Already two stages deep: collapse to whichever endpoint is closer.
      this.a = this.progress > 0.5 ? this.c : this.b;
      this.mixAB = 0;
    }
    this.c = target;
    this.t = 0;
    this.progress = 0;
    return true;
  }

  update(dt: number): void {
    if (this.progress >= 1) return;
    this.t += dt / this.duration;
    if (this.t >= 1) {
      this.t = 1;
      this.progress = 1;
      this.a = this.b = this.c;
      this.mixAB = 0;
    } else {
      this.progress = EASINGS[this.easing](this.t);
    }
  }

  /** Jump straight to the finished state (used when a topology is applied instantly). */
  snap(target: number): void {
    this.a = this.b = this.c = target;
    this.mixAB = 0;
    this.progress = 1;
    this.t = 1;
  }
}
