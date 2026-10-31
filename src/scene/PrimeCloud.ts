import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  GLSL3,
  OneFactor,
  Points,
  RawShaderMaterial,
  Vector3,
  type IUniform,
  type Texture,
} from 'three';
import { MAX_COUNT } from '../topology/constants';
import { shaders } from '../shaders';
import type { SharedUniforms } from './uniforms';

/** Uniforms only the draw pass reads. */
export interface DisplayUniforms {
  [name: string]: IUniform;
  uGlow: IUniform<number>;
  uPrimeFloor: IUniform<number>;
  uFocus: IUniform<number>;
  uKeepK: IUniform<number>;
  uPrimeDensity: IUniform<number>;
  uAppear: IUniform<number>;
  uLabels: IUniform<number>;
  uFamilyMinPx: IUniform<number>;
  uColorMode: IUniform<number>;
  uColPrime: IUniform<Vector3>;
  uColComp: IUniform<Vector3>;
  uColAccent: IUniform<Vector3>;
  uGlyphs: IUniform<Texture>;
}

/**
 * The integers themselves: one attribute-less GL point per integer.
 *
 * Three.js insists on a `position` attribute to size the draw, so we give it one-vertex
 * backing storage and lie about its `count`. The shader never reads it; the integer comes
 * from gl_VertexID, and the submitted window [lo, hi] is selected with `uBase` + draw range.
 */
export class PrimeCloud {
  readonly points: Points;
  readonly geometry = new BufferGeometry();
  readonly display: DisplayUniforms;
  private readonly material: RawShaderMaterial;

  constructor(
    private readonly shared: SharedUniforms,
    glyphs: Texture,
  ) {
    const position = new BufferAttribute(new Float32Array(3), 3);
    (position as { count: number }).count = MAX_COUNT;
    this.geometry.setAttribute('position', position);
    this.geometry.setDrawRange(0, 0);

    this.display = {
      uGlow: { value: 1 },
      uPrimeFloor: { value: 1.0 },
      uFocus: { value: 0.6 },
      uKeepK: { value: 3 },
      uPrimeDensity: { value: 0.07 },
      uAppear: { value: 1 },
      uLabels: { value: 1 },
      uFamilyMinPx: { value: 0 },
      uColorMode: { value: 0 },
      uColPrime: { value: new Vector3(1, 0.1, 0.22) },
      uColComp: { value: new Vector3(0.6, 0.7, 0.95) },
      uColAccent: { value: new Vector3(1, 0.8, 0.3) },
      uGlyphs: { value: glyphs },
    };

    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      uniforms: { ...shared, ...this.display },
      vertexShader: shaders.pointsVertex,
      fragmentShader: shaders.pointsFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneFactor,
    });

    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Submit integers lo..hi (inclusive, 1-based). An empty window draws nothing. */
  setWindow(lo: number, hi: number): number {
    const count = Math.max(0, hi - lo + 1);
    this.shared.uBase.value = Math.max(0, lo - 1);
    this.geometry.setDrawRange(0, count);
    return count;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
