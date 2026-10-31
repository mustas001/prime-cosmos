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
} from 'three';
import { shaders } from '../shaders';
import type { SharedUniforms } from './uniforms';

interface MarkerUniforms {
  [name: string]: IUniform;
  uMarkerN: IUniform<number>;
  uMarkerMinPx: IUniform<number>;
  uMarkerColor: IUniform<Vector3>;
  uMarkerAlpha: IUniform<number>;
  uMarkerSpin: IUniform<number>;
  uTime: IUniform<number>;
}

/** A reticle around one integer. It follows the integer through morphs and zooms. */
export class Marker {
  readonly points: Points;
  private readonly uniforms: MarkerUniforms;
  private readonly material: RawShaderMaterial;

  constructor(shared: SharedUniforms, opts: { color: [number, number, number]; spin: boolean; minPx: number; alpha: number }) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));

    this.uniforms = {
      uMarkerN: { value: 0 },
      uMarkerMinPx: { value: opts.minPx },
      uMarkerColor: { value: new Vector3(...opts.color) },
      uMarkerAlpha: { value: opts.alpha },
      uMarkerSpin: { value: opts.spin ? 1 : 0 },
      uTime: { value: 0 },
    };
    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      uniforms: { ...shared, ...this.uniforms },
      vertexShader: shaders.markerVertex,
      fragmentShader: shaders.markerFragment,
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
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Integer to ring; 0 hides the marker. */
  set n(value: number) {
    this.uniforms.uMarkerN.value = value;
    this.points.visible = value > 0;
  }

  get n(): number {
    return this.uniforms.uMarkerN.value;
  }

  setMinPx(px: number): void {
    this.uniforms.uMarkerMinPx.value = px;
  }

  setColor(r: number, g: number, b: number): void {
    this.uniforms.uMarkerColor.value.set(r, g, b);
  }

  setTime(t: number): void {
    this.uniforms.uTime.value = t;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
