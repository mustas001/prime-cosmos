import { Pane, type FolderApi } from 'tweakpane';
import { FAMILIES, QUADRATIC_PRESETS } from '../math/families';
import { GOLDEN_ANGLE_DEG, MAX_COUNT } from '../topology/constants';
import { TOPOLOGIES } from '../topology/topologies';
import { compact } from '../hud/Hud';
import { PALETTES, type AppState } from '../app/state';

export interface ControlHandlers {
  onChange(key: keyof AppState): void;
  onFrame(): void;
  onGoTo(n: number): void;
}

const PHYLLOTAXIS_PRESETS: Record<string, { angle: number; exponent: number }> = {
  'Golden angle · 137.508°': { angle: GOLDEN_ANGLE_DEG, exponent: 0.5 },
  'Silver mean · 61.769°': { angle: 360 / (1 + Math.SQRT2) ** 2, exponent: 0.5 },
  'Bronze mean · 33.001°': { angle: 360 / ((3 + Math.sqrt(13)) / 2) ** 2, exponent: 0.5 },
  'Ulam polar · 1 rad, r ∝ n': { angle: 360 / (2 * Math.PI), exponent: 1 },
};

type Binding = ReturnType<FolderApi['addBinding']>;

const options = <T extends string>(entries: ReadonlyArray<readonly [string, T]>) =>
  Object.fromEntries(entries) as Record<string, T>;

export interface Controls {
  pane: Pane;
  /** Pull values from `state` into the widgets and re-evaluate which parameters are relevant. */
  refresh(): void;
}

export function createControls(host: HTMLElement, state: AppState, handlers: ControlHandlers, sieveLimit: number): Controls {
  const pane = new Pane({ container: host, title: 'Prime Cosmos' });
  const maxCount = Math.min(MAX_COUNT, sieveLimit);

  const bind = <K extends keyof AppState>(folder: FolderApi, key: K, params: Record<string, unknown>): Binding => {
    const b = folder.addBinding(state, key, params);
    b.on('change', () => handlers.onChange(key));
    return b;
  };

  // ---- Layout ---------------------------------------------------------------
  const layout = pane.addFolder({ title: 'Layout' });
  bind(layout, 'topology', {
    label: 'topology',
    // Numbered to match the keyboard: 1–9, or type 1 then 0 / 1 / 2 for 10–12.
    options: options(TOPOLOGIES.map((t, i) => [`${i + 1} · ${t.label}`, t.id] as const)),
  });

  const ui = { logCount: Math.log10(state.count), preset: 'Golden angle · 137.508°', quadPreset: 'Euler n² + n + 41', goTo: 1 };
  layout
    .addBinding(ui, 'logCount', {
      label: 'integers',
      min: 2,
      max: Math.log10(maxCount),
      step: 0.01,
      format: (v: number) => compact(10 ** v),
    })
    .on('change', () => {
      state.count = Math.min(maxCount, Math.max(100, Math.round(10 ** ui.logCount)));
      handlers.onChange('count');
    });

  const width = bind(layout, 'width', { label: 'row width W', min: 2, max: 1024, step: 1 });
  const presets = layout.addBinding(ui, 'preset', { label: 'preset', options: options(Object.keys(PHYLLOTAXIS_PRESETS).map((k) => [k, k] as const)) });
  const angle = bind(layout, 'angle', { label: 'angle °', min: 0, max: 360, step: 0.0001 });
  const exponent = bind(layout, 'exponent', { label: 'radius exp.', min: 0.3, max: 1.2, step: 0.005 });
  const modulus = bind(layout, 'modulus', { label: 'modulus m', min: 2, max: 210, step: 1 });
  presets.on('change', () => {
    Object.assign(state, PHYLLOTAXIS_PRESETS[ui.preset]);
    pane.refresh();
    handlers.onChange('angle');
  });

  // ---- Morph ---------------------------------------------------------------
  const morph = pane.addFolder({ title: 'Morph', expanded: false });
  bind(morph, 'morphSeconds', { label: 'duration s', min: 0.3, max: 6, step: 0.1 });
  bind(morph, 'easing', { label: 'easing', options: { Silk: 'silk', Cubic: 'cubic', Expo: 'expo' } });
  bind(morph, 'stagger', { label: 'ripple', min: 0, max: 0.8, step: 0.01 });
  bind(morph, 'swirl', { label: 'swirl', min: -0.6, max: 0.6, step: 0.01 });
  bind(morph, 'autoFrame', { label: 'auto-frame' });

  // ---- Primes --------------------------------------------------------------
  const primes = pane.addFolder({ title: 'Primes' });
  bind(primes, 'field', {
    label: 'field',
    options: { 'Integer primes': 'integers', 'Gaussian primes': 'gaussian', 'Eisenstein primes': 'eisenstein' },
  });
  bind(primes, 'palette', { label: 'palette', options: options(Object.entries(PALETTES).map(([id, p]) => [p.label, id as keyof typeof PALETTES] as const)) });
  bind(primes, 'colorMode', {
    label: 'colour by',
    options: { Uniform: 'uniform', 'Last digit': 'lastDigit', 'mod 4': 'mod4', 'mod 6': 'mod6' },
  });
  bind(primes, 'primeSize', { label: 'size', min: 0.4, max: 2.5, step: 0.01 });
  bind(primes, 'glow', { label: 'glow', min: 0, max: 2, step: 0.01 });

  // ---- Composites ----------------------------------------------------------
  const composites = pane.addFolder({ title: 'Composites' });
  bind(composites, 'compositesVisible', { label: 'show (C)' });
  bind(composites, 'compositeOpacity', { label: 'opacity', min: 0, max: 1, step: 0.01 });
  bind(composites, 'compositeSize', { label: 'size', min: 0.2, max: 1.6, step: 0.01 });

  // ---- Highlight -----------------------------------------------------------
  const highlight = pane.addFolder({ title: 'Highlight' });
  bind(highlight, 'family', { label: 'family', options: options(FAMILIES.map((f) => [f.label, f.id] as const)) });
  const quadPreset = highlight.addBinding(ui, 'quadPreset', { label: 'polynomial', options: options(Object.keys(QUADRATIC_PRESETS).map((k) => [k, k] as const)) });
  const quadA = bind(highlight, 'quadA', { label: 'a', min: 1, max: 4, step: 1 });
  const quadB = bind(highlight, 'quadB', { label: 'b', min: -9, max: 9, step: 1 });
  const quadC = bind(highlight, 'quadC', { label: 'c', min: 1, max: 100, step: 1 });
  quadPreset.on('change', () => {
    const q = QUADRATIC_PRESETS[ui.quadPreset];
    state.quadA = q.a;
    state.quadB = q.b;
    state.quadC = q.c;
    pane.refresh();
    handlers.onChange('quadA');
  });
  const focus = bind(highlight, 'focus', { label: 'dim others', min: 0, max: 1, step: 0.01 });

  // ---- Render --------------------------------------------------------------
  const render = pane.addFolder({ title: 'Render', expanded: false });
  bind(render, 'dotSize', { label: 'dot size', min: 0.2, max: 1.2, step: 0.01 });
  bind(render, 'bloom', { label: 'bloom', min: 0, max: 2, step: 0.01 });
  bind(render, 'exposure', { label: 'exposure', min: 0.4, max: 2.5, step: 0.01 });
  bind(render, 'labels', { label: 'numerals (L)' });
  bind(render, 'quality', { label: 'quality', options: { High: 'high', Balanced: 'balanced', Fast: 'fast' } });

  // ---- Navigate ------------------------------------------------------------
  const navigate = pane.addFolder({ title: 'Navigate' });
  navigate.addBinding(ui, 'goTo', { label: 'go to n', min: 1, max: maxCount, step: 1 });
  navigate.addButton({ title: 'Fly to n' }).on('click', () => handlers.onGoTo(Math.round(ui.goTo)));
  navigate.addButton({ title: 'Frame everything (F)' }).on('click', () => handlers.onFrame());

  const refresh = (): void => {
    ui.logCount = Math.log10(state.count);
    const t = state.topology;
    width.hidden = t !== 'matrix' && t !== 'serpentine';
    presets.hidden = angle.hidden = exponent.hidden = t !== 'phyllotaxis';
    modulus.hidden = t !== 'clock';

    const isQuad = state.family === 'quadratic';
    quadPreset.hidden = quadA.hidden = quadB.hidden = quadC.hidden = !isQuad;
    focus.hidden = state.family === 'none';
    pane.refresh();
  };

  if (window.innerWidth < 900) pane.expanded = false;
  refresh();
  return { pane, refresh };
}
