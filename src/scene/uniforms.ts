import { Vector2, Vector3, type IUniform, type Texture } from 'three';

/** Uniform objects shared by reference between the draw, pick and marker materials. */
export interface SharedUniforms {
  [name: string]: IUniform;
  uBits: IUniform<Texture>;
  uLimit: IUniform<number>;
  uCount: IUniform<number>;
  uBase: IUniform<number>;

  uResolution: IUniform<Vector2>;
  uCenterHi: IUniform<Vector2>;
  uCenterLo: IUniform<Vector2>;
  uScale: IUniform<number>;
  uMaxPoint: IUniform<number>;

  uTopoA: IUniform<number>;
  uTopoB: IUniform<number>;
  uTopoC: IUniform<number>;
  uMixAB: IUniform<number>;
  uTransitionProgress: IUniform<number>;
  uStagger: IUniform<number>;
  uSwirl: IUniform<number>;

  uWidth: IUniform<number>;
  uAngle: IUniform<Vector3>;
  uExponent: IUniform<number>;
  uModulus: IUniform<number>;

  uField: IUniform<number>;
  uFamily: IUniform<number>;
  uQuadA: IUniform<number>;
  uQuadB: IUniform<number>;
  uQuadC: IUniform<number>;

  uDotScale: IUniform<number>;
  uPrimeScale: IUniform<number>;
  uCompScale: IUniform<number>;
  uCompAlpha: IUniform<number>;
}

export function createSharedUniforms(bits: Texture, limit: number, maxPoint: number): SharedUniforms {
  return {
    uBits: { value: bits },
    uLimit: { value: limit },
    uCount: { value: 0 },
    uBase: { value: 0 },

    uResolution: { value: new Vector2(1, 1) },
    uCenterHi: { value: new Vector2() },
    uCenterLo: { value: new Vector2() },
    uScale: { value: 1 },
    uMaxPoint: { value: maxPoint },

    uTopoA: { value: 0 },
    uTopoB: { value: 0 },
    uTopoC: { value: 0 },
    uMixAB: { value: 0 },
    uTransitionProgress: { value: 1 },
    uStagger: { value: 0.35 },
    uSwirl: { value: 0.22 },

    uWidth: { value: 30 },
    uAngle: { value: new Vector3() },
    uExponent: { value: 0.5 },
    uModulus: { value: 30 },

    uField: { value: 0 },
    uFamily: { value: 0 },
    uQuadA: { value: 1 },
    uQuadB: { value: 1 },
    uQuadC: { value: 41 },

    uDotScale: { value: 0.62 },
    uPrimeScale: { value: 1 },
    uCompScale: { value: 1 },
    uCompAlpha: { value: 0.2 },
  };
}

/**
 * Pack a fraction g in [0, 1) as the fixed-point limbs turnsFixed() expects:
 * g = hi/2^32 + lo/2^53 with hi split into two 16-bit halves (float32 holds 24 exact bits).
 */
export function packTurns(g: number, out: Vector3): Vector3 {
  const scaled = (g - Math.floor(g)) * 2 ** 32;
  const hi = Math.floor(scaled);
  const lo = Math.floor((scaled - hi) * 2 ** 21);
  return out.set(Math.floor(hi / 65536), hi % 65536, lo);
}
