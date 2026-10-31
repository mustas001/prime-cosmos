import { Hud, linearToCss, type DensityBucket, type LegendItem } from '../hud/Hud';
import { describeInteger, type IntegerInfo } from '../hud/inspect';
import { getFamily } from '../math/families';
import { FIELD_GLSL } from '../math/fields';
import type { PrimeBitset } from '../math/PrimeBitset';
import { MapController, type View } from '../scene/MapController';
import { Marker } from '../scene/Markers';
import { MorphTimeline } from '../scene/MorphTimeline';
import { Picker } from '../scene/Picker';
import { PrimeCloud } from '../scene/PrimeCloud';
import { Stage } from '../scene/Stage';
import { createGlyphAtlas, createPrimeTexture } from '../scene/textures';
import { createSharedUniforms, packTurns, type SharedUniforms } from '../scene/uniforms';
import {
  TOPOLOGIES,
  framingCount,
  getTopology,
  spacingAt,
  type Rect,
  type Topology,
  type TopologyParams,
} from '../topology/topologies';
import { createControls, type Controls } from '../ui/controls';
import { COLOR_MODE_GLSL, DEFAULT_STATE, PALETTES, QUALITY_SCALE, type AppState } from './state';

const HUD_INTERVAL_MS = 160;
const PICK_INTERVAL_MS = 45;
const DIGIT_CHORD_MS = 700; // window for typing a two-digit layout number
const MAX_SCALE = 400; // CSS px per integer spacing
const STRIP_BUCKETS = 56;

const WHITE_ISH: readonly [number, number, number] = [1, 0.92, 0.88];
const LAST_DIGIT_COLORS: Array<[string, readonly [number, number, number]]> = [
  ['…1', [1, 0.1, 0.22]],
  ['…3', [1, 0.55, 0.06]],
  ['…7', [0.1, 0.8, 1]],
  ['…9', [0.65, 0.3, 1]],
];

/**
 * Ties the scene, camera, morph timeline, GPU picking, HUD and controls together and owns
 * the render loop. Rendering is on-demand: nothing is drawn while the view is at rest.
 */
export class App {
  readonly state: AppState;
  readonly stage: Stage;
  readonly controller: MapController;
  readonly morph: MorphTimeline;

  private readonly shared: SharedUniforms;
  private readonly cloud: PrimeCloud;
  private readonly picker: Picker;
  private readonly hoverMarker: Marker;
  private readonly selectMarker: Marker;
  private readonly controls: Controls;
  private readonly resizeObserver: ResizeObserver;

  // render state
  private raf = 0;
  private lastTime = 0;
  private lastRender = 0;
  private time = 0;
  private needsRender = true;
  private fpsEma = 0;
  private compFade = 0;
  private introT = 0;
  private window: [number, number] = [1, 1];
  private drawn = 0;

  // interaction state
  private fitted = true;
  private pointer = { x: 0, y: 0, inside: false };
  private hovered = 0;
  private selected = 0;
  private hoverInfo: IntegerInfo | null = null;
  private pickDirty = false;
  private pickBusy = false;
  private pickToken = 0;
  private lastPickAt = 0;
  private lastHudAt = 0;
  private lastDigit = -1;
  private lastDigitAt = 0;
  private lastSize = { x: 0, y: 0 };

  constructor(
    private readonly host: HTMLElement,
    panelHost: HTMLElement,
    private readonly hud: Hud,
    readonly primes: PrimeBitset,
    initial: Partial<AppState> = {},
  ) {
    const state = (this.state = { ...DEFAULT_STATE, ...initial });

    this.stage = new Stage(host);
    const bits = createPrimeTexture(primes);
    this.shared = createSharedUniforms(bits, primes.limit, this.stage.maxPointSize);
    this.shared.uCount.value = state.count;

    this.cloud = new PrimeCloud(this.shared, createGlyphAtlas());
    this.stage.scene.add(this.cloud.points);

    this.hoverMarker = new Marker(this.shared, { color: [0.9, 0.95, 1], spin: false, minPx: 30, alpha: 1.1 });
    this.selectMarker = new Marker(this.shared, { color: [1, 0.85, 0.5], spin: true, minPx: 46, alpha: 1.6 });
    this.stage.scene.add(this.hoverMarker.points, this.selectMarker.points);

    this.picker = new Picker(this.stage.renderer, this.stage.camera, this.cloud.geometry, this.shared);

    this.morph = new MorphTimeline(getTopology(state.topology).glsl);

    this.controller = new MapController(host);
    this.controller.onUserInput = () => {
      this.fitted = false;
    };
    this.controller.onHover = (x, y, inside) => this.onPointerMove(x, y, inside);
    this.controller.onClick = (x, y) => void this.onClick(x, y);

    this.controls = createControls(
      panelHost,
      state,
      {
        onChange: (key) => this.onStateChange(key),
        onFrame: () => this.frame(true, 1.2),
        onGoTo: (n) => this.flyToInteger(n),
      },
      primes.limit,
    );

    this.hud.onAction = (action) => {
      if (action === 'clear') this.select(0);
      else if (action === 'fly') this.flyToInteger(this.selected);
      else this.stepPrime(action === 'next' ? 1 : -1);
    };

    window.addEventListener('keydown', this.onKeyDown);
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(host);

    this.applyQuality();
    this.applyParams();
    this.applyLook();
    this.onResize();
    this.updateBrand();
    this.updateLegend();
  }

  // ---- lifecycle --------------------------------------------------------------

  /** Begin the render loop with the "fly out from 1 to the whole range" intro. */
  start(intro = true): void {
    if (intro) {
      this.cloud.display.uAppear.value = 0;
      this.introT = 0;
      this.controller.setView({ cx: 0, cy: 0, scale: 90 });
      this.controller.flyTo(this.frameView(), 7.5);
    } else {
      this.introT = 1;
      this.cloud.display.uAppear.value = 1;
      this.controller.setView(this.frameView());
    }
    this.fitted = true;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    this.resizeObserver.disconnect();
    this.controller.dispose();
    this.controls.pane.dispose();
    this.picker.dispose();
    this.hoverMarker.dispose();
    this.selectMarker.dispose();
    this.cloud.dispose();
    this.stage.dispose();
  }

  // ---- derived configuration ---------------------------------------------------

  private get params(): TopologyParams {
    const { width, angle, exponent, modulus } = this.state;
    return { width, angleDeg: angle, exponent, modulus };
  }

  private get topology(): Topology {
    return getTopology(this.state.topology);
  }

  private frameView(): View {
    const count = framingCount(this.state.topology, this.state.count, this.params);
    const bounds = this.topology.bounds(count, this.params);
    const scale = this.controller.fitScale(bounds, 0.12);
    return {
      cx: (bounds.x0 + bounds.x1) / 2,
      cy: (bounds.y0 + bounds.y1) / 2,
      scale: Math.min(Math.max(scale, this.controller.minScale), MAX_SCALE),
    };
  }

  private frame(animated: boolean, seconds: number): void {
    const view = this.frameView();
    if (animated) this.controller.flyTo(view, seconds);
    else this.controller.setView(view);
    this.fitted = true;
    this.needsRender = true;
  }

  private updateLimits(): void {
    const bounds = this.topology.bounds(this.state.count, this.params);
    const fit = this.controller.fitScale(bounds, 0.09);
    this.controller.setLimits(Math.max(1e-6, fit * 0.12), MAX_SCALE);
  }

  // ---- state → GPU ---------------------------------------------------------------

  private applyQuality(): void {
    const q = QUALITY_SCALE[this.state.quality];
    this.stage.setQuality(q.maxDpr, q.scale);
    this.cloud.display.uKeepK.value = this.state.quality === 'fast' ? 1.8 : 3;
  }

  private applyParams(): void {
    const { state, shared } = this;
    shared.uWidth.value = state.width;
    shared.uExponent.value = state.exponent;
    shared.uModulus.value = state.modulus;
    packTurns(state.angle / 360, shared.uAngle.value);
    shared.uCount.value = state.count;
    shared.uQuadA.value = state.quadA;
    shared.uQuadB.value = state.quadB;
    shared.uQuadC.value = state.quadC;
  }

  private applyLook(): void {
    const { state, shared, cloud, stage } = this;
    const palette = PALETTES[state.palette];
    const family = getFamily(state.family);
    const d = cloud.display;

    d.uColPrime.value.set(...palette.prime);
    d.uColComp.value.set(...palette.composite);
    d.uColAccent.value.set(...family.color);
    d.uFamilyMinPx.value = family.minRingPx * stage.pixelRatio;
    d.uColorMode.value = COLOR_MODE_GLSL[state.colorMode];
    d.uGlow.value = state.glow;
    d.uFocus.value = state.focus;
    d.uLabels.value = state.labels ? 1 : 0;

    shared.uFamily.value = family.glsl;
    shared.uField.value = FIELD_GLSL[state.field];
    shared.uDotScale.value = state.dotSize;
    shared.uPrimeScale.value = state.primeSize;
    shared.uCompScale.value = state.compositeSize;
    shared.uStagger.value = state.stagger;
    shared.uSwirl.value = state.swirl;

    stage.setExposure(state.exposure);
    this.needsRender = true;
  }

  private onStateChange(key: keyof AppState): void {
    switch (key) {
      case 'topology':
        this.changeTopology();
        break;
      case 'count':
        this.applyParams();
        this.updateLimits();
        if (this.fitted) this.frame(true, 0.8);
        break;
      case 'width':
      case 'exponent':
      case 'modulus':
      case 'angle':
        this.applyParams();
        this.updateLimits();
        if (this.fitted && key !== 'angle' && key !== 'modulus') this.frame(true, 0.5);
        this.refreshSelection();
        break;
      case 'quadA':
      case 'quadB':
      case 'quadC':
        this.applyParams();
        break;
      case 'quality':
        this.applyQuality();
        this.onResize();
        break;
      case 'family':
      case 'field':
        this.controls.refresh();
        this.refreshSelection();
        break;
      default:
        break;
    }
    this.applyLook();
    this.updateLegend();
    this.pickDirty = true;
  }

  private changeTopology(): void {
    const topology = this.topology;
    if (!this.morph.start(topology.glsl, this.state.morphSeconds, this.state.easing)) return;

    this.updateLimits();
    this.updateBrand();
    this.controls.refresh();
    this.refreshSelection();

    if (this.selected) {
      // Stay locked on the pinned integer as it travels to its new home.
      const [x, y] = topology.position(this.selected, this.params);
      this.controller.flyTo({ cx: x, cy: y, scale: this.controller.scale }, this.state.morphSeconds);
    } else if (this.state.autoFrame) {
      this.frame(true, this.state.morphSeconds);
    }
    this.needsRender = true;
  }

  // ---- HUD text ----------------------------------------------------------------------

  private updateBrand(): void {
    const t = this.topology;
    this.hud.setBrand(t.label, t.tagline);
  }

  private updateLegend(): void {
    const { state } = this;
    const palette = PALETTES[state.palette];
    const items: LegendItem[] = [];
    const fieldName = { integers: 'prime', gaussian: 'Gaussian prime', eisenstein: 'Eisenstein prime' }[state.field];

    if (state.field === 'integers' && state.colorMode === 'lastDigit') {
      LAST_DIGIT_COLORS.forEach(([label, c]) => items.push({ label: `prime ${label}`, color: linearToCss(c) }));
    } else if (state.field === 'integers' && state.colorMode === 'mod4') {
      items.push({ label: 'p ≡ 1 (mod 4)', color: linearToCss([1, 0.1, 0.22]) }, { label: 'p ≡ 3 (mod 4)', color: linearToCss([0.1, 0.8, 1]) });
    } else if (state.field === 'integers' && state.colorMode === 'mod6') {
      items.push({ label: '6k + 1', color: linearToCss([1, 0.1, 0.22]) }, { label: '6k − 1', color: linearToCss([0.1, 0.8, 1]) });
    } else {
      items.push({ label: fieldName, color: linearToCss(palette.prime) });
    }
    if (state.field === 'integers' && state.colorMode !== 'uniform') items.push({ label: '2, 3, 5', color: linearToCss(WHITE_ISH) });
    if (state.compositesVisible) items.push({ label: 'composite', color: linearToCss(palette.composite) });

    const family = getFamily(state.family);
    if (family.id !== 'none') items.push({ label: family.label, color: linearToCss(family.color), ring: true });
    this.hud.setLegend(items);
  }

  // ---- loop ------------------------------------------------------------------------------

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(1e-4, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.time += dt;

    let dirty = this.needsRender;
    const moved = this.controller.update(dt);
    dirty ||= moved;

    const wasMorphing = this.morph.active;
    this.morph.update(dt);
    dirty ||= wasMorphing || this.morph.active;
    // Not `dirty ||= this.updateFades(dt)`: that would skip the call whenever the camera is
    // already moving, freezing the intro reveal and the composite fade mid-pan.
    const fading = this.updateFades(dt);
    dirty ||= fading;
    // The selection reticle spins, so keep it alive at a relaxed 30 fps.
    dirty ||= this.selected > 0 && now - this.lastRender > 33;

    if (dirty) this.renderFrame(now);
    this.pickStep(now, moved || wasMorphing || this.morph.active);
    if (now - this.lastHudAt > HUD_INTERVAL_MS) {
      this.lastHudAt = now;
      this.updateHud(now);
    }
  };

  /** Eases composite opacity and the intro reveal. Returns true while anything is animating. */
  private updateFades(dt: number): boolean {
    let animating = false;

    const target = this.state.compositesVisible ? this.state.compositeOpacity : 0;
    const diff = target - this.compFade;
    if (Math.abs(diff) > 0.001) {
      this.compFade += diff * (1 - Math.exp(-dt * 9));
      animating = true;
    } else {
      this.compFade = target;
    }
    this.shared.uCompAlpha.value = this.compFade;

    if (this.introT < 1) {
      this.introT = Math.min(1, this.introT + dt / 2.6);
      const t = 1 - (1 - this.introT) ** 3;
      this.cloud.display.uAppear.value = t;
      animating = true;
    }
    return animating;
  }

  private renderFrame(now: number): void {
    this.syncUniforms();
    this.hoverMarker.setTime(this.time);
    this.selectMarker.setTime(this.time);
    this.stage.render();
    this.needsRender = false;

    const dtMs = now - this.lastRender;
    if (dtMs > 0 && dtMs < 500) {
      const fps = 1000 / dtMs;
      this.fpsEma = this.fpsEma === 0 ? fps : this.fpsEma + (fps - this.fpsEma) * 0.1;
    }
    this.lastRender = now;
  }

  /** Per-frame uniforms: camera, morph stages, and the integer window to submit. */
  private syncUniforms(): void {
    const { shared, controller, stage, morph, state } = this;
    const pr = stage.pixelRatio;
    const scaleDev = controller.scale * pr;

    shared.uScale.value = scaleDev;
    shared.uResolution.value.set(stage.width * pr, stage.height * pr);
    // Split the double-precision centre into a float-exact part and a small remainder.
    const hx = Math.fround(controller.cx);
    const hy = Math.fround(controller.cy);
    shared.uCenterHi.value.set(hx, hy);
    shared.uCenterLo.value.set(controller.cx - hx, controller.cy - hy);

    shared.uTopoA.value = morph.a;
    shared.uTopoB.value = morph.b;
    shared.uTopoC.value = morph.c;
    shared.uMixAB.value = morph.mixAB;
    shared.uTransitionProgress.value = morph.progress;

    // Which integers can possibly be on screen? Mid-morph points travel between layouts,
    // so only the steady state can be culled by window.
    let lo = 1;
    let hi = state.count;
    if (!morph.active) {
      const spritePx = Math.min(
        stage.maxPointSize,
        8 + scaleDev * state.dotSize * Math.max(state.primeSize, state.compositeSize) * (1 + 1.3 * state.glow) * 1.6,
      );
      const family = getFamily(state.family);
      const marginWorld = Math.max(spritePx, family.minRingPx * pr * 1.4) / 2 / scaleDev + 1;
      [lo, hi] = this.topology.window(controller.viewRect(), marginWorld, state.count, this.params);
    }
    this.window = [lo, hi];
    this.drawn = this.cloud.setWindow(lo, hi);
    const mid = Math.sqrt(Math.max(1, lo) * Math.max(1, hi));
    this.cloud.display.uPrimeDensity.value = 1 / Math.log(Math.max(3, mid));

    // Bloom adapts to zoom: sub-pixel primes are dim and need a low threshold to glow at all,
    // but once dots are large and bright the same threshold would wash the whole screen.
    const dotPx = scaleDev * spacingAt(state.topology, mid, this.params) * state.dotSize * state.primeSize;
    const t = Math.min(1, Math.max(0, (dotPx - 0.8) / 3.4));
    const eased = t * t * (3 - 2 * t);
    this.stage.setBloom(state.bloom * (1 - 0.45 * eased), 0.2 + 0.7 * eased, 0.42 - 0.17 * eased);
  }

  // ---- picking & selection -----------------------------------------------------------------

  private onPointerMove(x: number, y: number, inside: boolean): void {
    this.pointer = { x, y, inside };
    if (!inside) {
      this.setHover(0);
      return;
    }
    this.pickDirty = true;
    if (this.hovered) this.hud.moveHover(x + this.hostLeft, y + this.hostTop);
  }

  private get hostLeft(): number {
    return this.host.getBoundingClientRect().left;
  }

  private get hostTop(): number {
    return this.host.getBoundingClientRect().top;
  }

  /** Pick at a canvas position (CSS px). Resolves to the integer there, or 0. */
  pickAt(x: number, y: number): Promise<number> {
    return this.picker.pick(x, y, this.stage.width, this.stage.height, this.stage.pixelRatio);
  }

  private pickStep(now: number, viewChanged: boolean): void {
    if (viewChanged) this.pickDirty = true;
    const { pointer } = this;
    if (!pointer.inside || this.controller.dragging || !this.pickDirty) return;
    if (this.pickBusy || now - this.lastPickAt < PICK_INTERVAL_MS) return;

    this.pickDirty = false;
    this.pickBusy = true;
    this.lastPickAt = now;
    const token = ++this.pickToken;
    this.pickAt(pointer.x, pointer.y)
      .then((n) => {
        this.pickBusy = false;
        if (token === this.pickToken && this.pointer.inside) this.setHover(n);
      })
      .catch(() => {
        this.pickBusy = false;
      });
  }

  private setHover(n: number): void {
    if (!n) {
      this.pickToken++;
    }
    if (n === this.hovered) return;
    this.hovered = n;
    this.hoverMarker.n = n === this.selected ? 0 : n;
    this.hoverInfo = n ? this.describe(n) : null;
    this.hud.showHover(this.hoverInfo);
    if (n) this.hud.moveHover(this.pointer.x + this.hostLeft, this.pointer.y + this.hostTop);
    this.needsRender = true;
  }

  private async onClick(x: number, y: number): Promise<void> {
    const n = await this.pickAt(x, y);
    this.select(n === this.selected ? 0 : n);
  }

  private describe(n: number): IntegerInfo {
    const { state } = this;
    return describeInteger(n, this.primes, state.topology, this.params, {
      a: state.quadA,
      b: state.quadB,
      c: state.quadC,
    });
  }

  select(n: number): void {
    this.selected = n;
    this.selectMarker.n = n;
    this.hoverMarker.n = n === this.hovered ? 0 : this.hovered;
    this.hud.showInspector(n ? this.describe(n) : null);
    this.needsRender = true;
  }

  private refreshSelection(): void {
    if (this.selected) this.hud.showInspector(this.describe(this.selected));
  }

  /** Move to the previous/next prime relative to the selection (or hovered integer). */
  private stepPrime(dir: 1 | -1): void {
    const from = this.selected || this.hovered || 1;
    const target = dir > 0 ? this.primes.nextPrime(from) : this.primes.prevPrime(from);
    if (target < 1 || target > this.state.count) return;
    this.select(target);
    this.flyToInteger(target, Math.max(this.controller.scale, 24));
  }

  /** Select `n` and glide to it, keeping at least `minScale` px per integer. */
  flyToInteger(n: number, minScale = 70): void {
    const target = Math.min(Math.max(1, Math.round(n)), this.state.count);
    const [x, y] = this.topology.position(target, this.params);
    this.select(target);
    this.fitted = false;
    this.controller.flyTo({ cx: x, cy: y, scale: Math.max(minScale, this.controller.scale) }, 1.8);
  }

  // ---- keyboard ----------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

    const key = e.key.toLowerCase();
    if (key.length === 1 && key >= '0' && key <= '9') {
      this.pressDigit(Number(key));
      return;
    }
    switch (key) {
      case 't': {
        // T / Shift+T walk through every layout, including those without a number key.
        const current = TOPOLOGIES.findIndex((t) => t.id === this.state.topology);
        this.setTopology((current + (e.shiftKey ? -1 : 1) + TOPOLOGIES.length) % TOPOLOGIES.length);
        break;
      }
      case 'c':
        this.state.compositesVisible = !this.state.compositesVisible;
        this.controls.pane.refresh();
        this.onStateChange('compositesVisible');
        break;
      case 'l':
        this.state.labels = !this.state.labels;
        this.controls.pane.refresh();
        this.onStateChange('labels');
        break;
      case 'f':
        this.frame(true, 1.2);
        break;
      case 'escape':
        this.select(0);
        break;
      case '[':
        this.stepPrime(-1);
        break;
      case ']':
        this.stepPrime(1);
        break;
      default:
        break;
    }
  };

  /**
   * Number keys pick a layout by its number in the dropdown: 1–9 directly, and `1` followed
   * within a moment by `0`, `1` or `2` for 10–12. A lone `0` also means 10. The `1` acts at
   * once (no waiting); a second digit simply retargets the morph already under way.
   */
  private pressDigit(digit: number): void {
    const now = performance.now();
    const followsOne = this.lastDigit === 1 && now - this.lastDigitAt < DIGIT_CHORD_MS;
    this.lastDigit = digit;
    this.lastDigitAt = now;

    const number = followsOne && digit <= 2 ? 10 + digit : digit === 0 ? 10 : digit;
    if (number >= 1 && number <= TOPOLOGIES.length) this.setTopology(number - 1);
  }

  private setTopology(index: number): void {
    this.state.topology = TOPOLOGIES[index].id;
    this.controls.refresh();
    this.onStateChange('topology');
  }

  // ---- resize + HUD stats ---------------------------------------------------------------------

  private onResize(): void {
    const size = this.stage.resize();
    this.controller.resize(this.stage.width, this.stage.height);
    this.shared.uResolution.value.copy(size);
    this.updateLimits();
    this.applyLook();
    this.hoverMarker.setMinPx(30 * this.stage.pixelRatio);
    this.selectMarker.setMinPx(46 * this.stage.pixelRatio);

    // Keep a fitted view fitted as the window changes — but never cut the opening fly-out
    // short (ResizeObserver also fires once right after observe(), with an unchanged size).
    const changed = size.x !== this.lastSize.x || size.y !== this.lastSize.y;
    this.lastSize = { x: size.x, y: size.y };
    if (this.fitted && changed && !this.controller.flying) this.controller.setView(this.frameView());
    this.needsRender = true;
  }

  private updateHud(now: number): void {
    const { state, primes } = this;
    const [lo, hi] = this.window;
    if (hi < lo) return;

    const rect: Rect = this.controller.viewRect();
    const area = (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
    const mid = Math.sqrt(lo * hi);
    const spacing = spacingAt(state.topology, mid, this.params);
    const windowSize = hi - lo + 1;
    const integersInView = Math.min(windowSize, Math.max(1, area / (spacing * spacing)));

    const primesInWindow = primes.countRange(lo, hi + 1);
    const buckets: DensityBucket[] = [];
    const n = Math.min(STRIP_BUCKETS, windowSize);
    for (let i = 0; i < n; i++) {
      const a = lo + Math.floor((i * windowSize) / n);
      const b = lo + Math.floor(((i + 1) * windowSize) / n);
      const midpoint = Math.max(3, (a + b) / 2);
      buckets.push({ density: b > a ? primes.countRange(a, b) / (b - a) : 0, expected: 1 / Math.log(midpoint) });
    }

    this.hud.setStats({
      lo,
      hi,
      drawn: this.drawn,
      count: state.count,
      integersInView,
      pxPerUnit: this.controller.scale * spacing,
      primesInWindow,
      density: primesInWindow / windowSize,
      expected: 1 / Math.log(Math.max(3, mid)),
      fps: now - this.lastRender < 600 ? this.fpsEma : 0,
      frameMs: this.fpsEma > 0 ? 1000 / this.fpsEma : 0,
      buckets,
      fieldLabel: 'primes',
    });
  }
}
