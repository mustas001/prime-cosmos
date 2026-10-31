import type { FamilyId } from '../math/families';
import type { FieldId } from '../math/fields';
import { GOLDEN_ANGLE_DEG } from '../topology/constants';
import type { TopologyId } from '../topology/topologies';
import type { EasingId } from '../scene/MorphTimeline';

export type PaletteId = 'crimson' | 'solar' | 'aurora' | 'violet';
export type ColorMode = 'uniform' | 'lastDigit' | 'mod4' | 'mod6';
export type QualityId = 'high' | 'balanced' | 'fast';

export const COLOR_MODE_GLSL: Record<ColorMode, number> = { uniform: 0, lastDigit: 1, mod4: 2, mod6: 3 };

export interface Palette {
  label: string;
  /** Linear-RGB prime tint. */
  prime: readonly [number, number, number];
  /** Linear-RGB composite tint. */
  composite: readonly [number, number, number];
}

export const PALETTES: Record<PaletteId, Palette> = {
  crimson: { label: 'Crimson', prime: [1.0, 0.07, 0.17], composite: [0.45, 0.55, 0.85] },
  solar: { label: 'Solar', prime: [1.0, 0.36, 0.04], composite: [0.7, 0.58, 0.45] },
  aurora: { label: 'Aurora', prime: [0.06, 0.95, 0.55], composite: [0.4, 0.55, 0.78] },
  violet: { label: 'Ultraviolet', prime: [0.55, 0.22, 1.0], composite: [0.55, 0.62, 0.9] },
};

export interface AppState {
  // layout
  topology: TopologyId;
  count: number;
  width: number;
  angle: number;
  exponent: number;
  modulus: number;
  // morph
  morphSeconds: number;
  easing: EasingId;
  stagger: number;
  swirl: number;
  autoFrame: boolean;
  // what is a prime
  field: FieldId;
  // highlight
  family: FamilyId;
  quadA: number;
  quadB: number;
  quadC: number;
  focus: number;
  // look
  palette: PaletteId;
  colorMode: ColorMode;
  compositesVisible: boolean;
  compositeOpacity: number;
  compositeSize: number;
  dotSize: number;
  primeSize: number;
  glow: number;
  bloom: number;
  exposure: number;
  labels: boolean;
  quality: QualityId;
}

export const DEFAULT_STATE: AppState = {
  topology: 'ulam',
  count: 1_000_000,
  width: 30,
  angle: GOLDEN_ANGLE_DEG,
  exponent: 0.5,
  modulus: 30,

  morphSeconds: 2.2,
  easing: 'silk',
  stagger: 0.38,
  swirl: 0.22,
  autoFrame: true,

  field: 'integers',

  family: 'none',
  quadA: 1,
  quadB: 1,
  quadC: 41,
  focus: 0.65,

  palette: 'crimson',
  colorMode: 'uniform',
  compositesVisible: true,
  compositeOpacity: 0.22,
  compositeSize: 0.8,
  dotSize: 0.62,
  primeSize: 1,
  glow: 1,
  bloom: 0.7,
  exposure: 1,
  labels: true,
  quality: 'high',
};

export const QUALITY_SCALE: Record<QualityId, { maxDpr: number; scale: number }> = {
  high: { maxDpr: 2, scale: 1 },
  balanced: { maxDpr: 1, scale: 1 },
  fast: { maxDpr: 1, scale: 0.66 },
};
