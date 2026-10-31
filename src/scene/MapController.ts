import type { Rect } from '../topology/topologies';

/**
 * 2-D pan/zoom camera with the feel of a map: inertial drag, zoom toward the cursor with
 * exponential smoothing, pinch, keyboard, double-click zoom and cinematic fly-to.
 *
 * Why not THREE.MapControls: the scene is drawn by shaders that take the camera as plain
 * uniforms, and the view needs double precision (centre kept as a JS number, split into
 * hi/lo floats at upload) to stay jitter-free a million units from the origin while
 * spanning ~7 orders of magnitude of zoom.
 *
 * Units: `scale` is CSS px per world unit; world +y is up, screen +y is down.
 */

export interface View {
  cx: number;
  cy: number;
  scale: number;
}

interface Flight {
  from: View;
  to: View;
  elapsed: number;
  duration: number;
  /** Extra log-zoom-out at mid-flight so long jumps read as "zoom out, glide, zoom in". */
  arc: number;
}

const ZOOM_SMOOTHING = 14; // 1/s — higher is snappier
const FRICTION = 4.2; // 1/s — inertial pan decay
const WHEEL_SENSITIVITY = 0.0016;
const PINCH_WHEEL_SENSITIVITY = 0.012;
const KEY_PAN_SPEED = 0.8; // screen heights per second
const KEY_ZOOM_SPEED = 1.6; // e-folds per second

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class MapController {
  cx = 0;
  cy = 0;
  private logScale = Math.log(40);
  private targetLogScale = this.logScale;

  minScale = 1e-4;
  maxScale = 500;

  /** Called on user interaction that should cancel automation (intro flight, auto-frame). */
  onUserInput: (() => void) | null = null;
  onClick: ((x: number, y: number) => void) | null = null;
  onHover: ((x: number, y: number, inside: boolean) => void) | null = null;

  private width = 1;
  private height = 1;

  // Zoom anchor: the world point that should stay under the cursor while zoom smooths.
  private anchor: { wx: number; wy: number; ox: number; oy: number } | null = null;

  private velocity = { x: 0, y: 0 }; // screen px / s
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { id: number; startX: number; startY: number; moved: boolean; lastT: number } | null = null;
  private pinch: { dist: number } | null = null;
  private keys = new Set<string>();
  private flight: Flight | null = null;

  constructor(private readonly el: HTMLElement) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    const { el } = this;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }

  get scale(): number {
    return Math.exp(this.logScale);
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  /** True while a pointer is actively panning or pinching. */
  get dragging(): boolean {
    return (this.drag?.moved ?? false) || this.pinch !== null;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  /** World-space rectangle currently on screen. */
  viewRect(): Rect {
    const hw = this.width / 2 / this.scale;
    const hh = this.height / 2 / this.scale;
    return { x0: this.cx - hw, x1: this.cx + hw, y0: this.cy - hh, y1: this.cy + hh };
  }

  screenToWorld(px: number, py: number): [number, number] {
    const s = this.scale;
    return [this.cx + (px - this.width / 2) / s, this.cy - (py - this.height / 2) / s];
  }

  /** Scale at which `bounds` fits the viewport with `padding` (fraction of the viewport) to spare. */
  fitScale(bounds: Rect, padding = 0.12): number {
    const w = Math.max(bounds.x1 - bounds.x0, 1);
    const h = Math.max(bounds.y1 - bounds.y0, 1);
    return Math.min(this.width / w, this.height / h) * (1 - padding * 2);
  }

  setLimits(minScale: number, maxScale: number): void {
    this.minScale = minScale;
    this.maxScale = maxScale;
    this.targetLogScale = this.clampLog(this.targetLogScale);
    this.logScale = this.clampLog(this.logScale);
  }

  /** Instantly place the camera. */
  setView(view: View): void {
    this.cancelMotion();
    this.cx = view.cx;
    this.cy = view.cy;
    this.logScale = this.targetLogScale = this.clampLog(Math.log(view.scale));
  }

  /** Glide to `to` (smooth in/out, with a zoom-out arc for long hops). */
  flyTo(to: View, durationSec = 1.4): void {
    this.cancelMotion();
    const from: View = { cx: this.cx, cy: this.cy, scale: this.scale };
    const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy) * Math.min(from.scale, to.scale);
    const viewSize = Math.hypot(this.width, this.height);
    const arc = Math.min(2.2, Math.log1p(dist / viewSize) * 0.9);
    this.flight = { from, to: { ...to, scale: this.clampScale(to.scale) }, elapsed: 0, duration: durationSec, arc };
  }

  /** Advance the camera. Returns true if the view changed (so the caller knows to redraw). */
  update(dt: number): boolean {
    const beforeX = this.cx;
    const beforeY = this.cy;
    const beforeL = this.logScale;

    if (this.flight) {
      this.stepFlight(dt);
    } else {
      this.stepKeys(dt);
      this.stepZoom(dt);
      this.stepInertia(dt);
    }

    return this.cx !== beforeX || this.cy !== beforeY || this.logScale !== beforeL;
  }

  // ---- simulation steps -------------------------------------------------------

  private stepFlight(dt: number): void {
    const f = this.flight!;
    f.elapsed += dt;
    const t = Math.min(1, f.elapsed / f.duration);
    const e = smootherstep(t);
    const l0 = Math.log(f.from.scale);
    const l1 = Math.log(f.to.scale);

    // Position eases a little ahead of zoom so the camera "arrives" while still zooming in.
    const ep = smootherstep(Math.min(1, t * 1.15));
    this.cx = f.from.cx + (f.to.cx - f.from.cx) * ep;
    this.cy = f.from.cy + (f.to.cy - f.from.cy) * ep;
    this.logScale = this.targetLogScale = l0 + (l1 - l0) * e - f.arc * Math.sin(Math.PI * e);
    if (t >= 1) {
      this.flight = null;
      this.logScale = this.targetLogScale = l1;
      this.cx = f.to.cx;
      this.cy = f.to.cy;
    }
  }

  private stepZoom(dt: number): void {
    const delta = this.targetLogScale - this.logScale;
    if (Math.abs(delta) < 1e-5) {
      this.logScale = this.targetLogScale;
      this.anchor = null;
      return;
    }
    this.logScale += delta * (1 - Math.exp(-ZOOM_SMOOTHING * dt));
    if (this.anchor) {
      const { wx, wy, ox, oy } = this.anchor;
      const s = this.scale;
      this.cx = wx - ox / s;
      this.cy = wy + oy / s;
    }
  }

  private stepInertia(dt: number): void {
    if (this.drag || this.pinch) return;
    const { velocity: v } = this;
    if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1) {
      v.x = v.y = 0;
      return;
    }
    const s = this.scale;
    this.cx -= (v.x * dt) / s;
    this.cy += (v.y * dt) / s;
    const decay = Math.exp(-FRICTION * dt);
    v.x *= decay;
    v.y *= decay;
  }

  private stepKeys(dt: number): void {
    if (this.keys.size === 0) return;
    const k = this.keys;
    const dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const dy = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const dz = (k.has('=') || k.has('+') ? 1 : 0) - (k.has('-') || k.has('_') ? 1 : 0);
    if (dx || dy) {
      this.cancelFlightAndAnchor();
      const s = this.scale;
      this.cx += ((dx * KEY_PAN_SPEED * this.height) / s) * dt;
      this.cy += ((dy * KEY_PAN_SPEED * this.height) / s) * dt;
      this.velocity.x = this.velocity.y = 0;
      this.onUserInput?.();
    }
    if (dz) {
      this.zoomBy(dz * KEY_ZOOM_SPEED * dt * 2.2, this.width / 2, this.height / 2);
      this.onUserInput?.();
    }
  }

  // ---- zoom primitives ---------------------------------------------------------

  private clampLog(l: number): number {
    return Math.min(Math.log(this.maxScale), Math.max(Math.log(this.minScale), l));
  }

  private clampScale(s: number): number {
    return Math.exp(this.clampLog(Math.log(s)));
  }

  /** Zoom the *target* by `dLog` e-folds about the screen point (px, py). */
  private zoomBy(dLog: number, px: number, py: number): void {
    this.flight = null;
    const next = this.clampLog(this.targetLogScale + dLog);
    if (next === this.targetLogScale) return;
    this.targetLogScale = next;
    const [wx, wy] = this.screenToWorld(px, py);
    this.anchor = { wx, wy, ox: px - this.width / 2, oy: py - this.height / 2 };
  }

  /** Immediately rescale about a screen point (pinch). */
  private zoomNow(ratio: number, px: number, py: number): void {
    const [wx, wy] = this.screenToWorld(px, py);
    this.logScale = this.targetLogScale = this.clampLog(this.logScale + Math.log(ratio));
    const s = this.scale;
    this.cx = wx - (px - this.width / 2) / s;
    this.cy = wy + (py - this.height / 2) / s;
  }

  private cancelMotion(): void {
    this.flight = null;
    this.anchor = null;
    this.velocity.x = this.velocity.y = 0;
    this.targetLogScale = this.logScale;
  }

  private cancelFlightAndAnchor(): void {
    this.flight = null;
    this.anchor = null;
    this.targetLogScale = this.logScale;
  }

  // ---- input -------------------------------------------------------------------

  private local(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.cancelMotion();
    this.onUserInput?.();

    if (this.pointers.size === 1) {
      this.drag = { id: e.pointerId, startX: p.x, startY: p.y, moved: false, lastT: performance.now() };
      this.pinch = null;
    } else if (this.pointers.size === 2) {
      this.drag = null;
      this.pinch = { dist: this.pinchDistance() };
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId);
    if (prev) this.pointers.set(e.pointerId, p);
    this.onHover?.(p.x, p.y, true);

    if (this.pinch && this.pointers.size >= 2) {
      const dist = this.pinchDistance();
      const mid = this.pinchMidpoint();
      if (this.pinch.dist > 0 && dist > 0) this.zoomNow(dist / this.pinch.dist, mid.x, mid.y);
      this.pinch.dist = dist;
      return;
    }

    if (this.drag && this.drag.id === e.pointerId) {
      const dx = prev ? p.x - prev.x : 0;
      const dy = prev ? p.y - prev.y : 0;
      if (!this.drag.moved && Math.hypot(p.x - this.drag.startX, p.y - this.drag.startY) > 4) this.drag.moved = true;
      if (this.drag.moved) {
        const s = this.scale;
        this.cx -= dx / s;
        this.cy += dy / s;

        // Exponentially weighted velocity so a flick carries on after release.
        const now = performance.now();
        const dt = Math.max(1, now - this.drag.lastT) / 1000;
        this.drag.lastT = now;
        const blend = 1 - Math.exp(-dt * 30);
        this.velocity.x += (dx / dt - this.velocity.x) * blend;
        this.velocity.y += (dy / dt - this.velocity.y) * blend;
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const wasDrag = this.drag && this.drag.id === e.pointerId ? this.drag : null;
    this.pointers.delete(e.pointerId);
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);

    if (wasDrag) {
      this.drag = null;
      if (!wasDrag.moved) {
        this.velocity.x = this.velocity.y = 0;
        if (e.type === 'pointerup') this.onClick?.(wasDrag.startX, wasDrag.startY);
      } else if (performance.now() - wasDrag.lastT > 90) {
        this.velocity.x = this.velocity.y = 0; // held still before releasing: no fling
      }
    }
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 1) {
      const [id, p] = [...this.pointers.entries()][0];
      this.drag = { id, startX: p.x, startY: p.y, moved: true, lastT: performance.now() };
    }
  };

  private onPointerLeave = (): void => {
    if (this.pointers.size === 0) this.onHover?.(0, 0, false);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const sensitivity = e.ctrlKey ? PINCH_WHEEL_SENSITIVITY : WHEEL_SENSITIVITY;
    this.velocity.x = this.velocity.y = 0;
    this.zoomBy(-e.deltaY * unit * sensitivity, p.x, p.y);
    this.onUserInput?.();
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const p = this.local(e);
    this.cancelMotion();
    this.zoomBy(Math.log(2.6), p.x, p.y);
    this.onUserInput?.();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    this.keys.add(e.key.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = (): void => {
    this.keys.clear();
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private pinchMidpoint(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: this.width / 2, y: this.height / 2 };
  }
}
