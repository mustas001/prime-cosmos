import {
  GLSL3,
  NearestFilter,
  NoBlending,
  Points,
  RGBAFormat,
  RawShaderMaterial,
  Scene,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type BufferGeometry,
  type Camera,
  type IUniform,
  type WebGLRenderer,
} from 'three';
import { shaders } from '../shaders';
import type { SharedUniforms } from './uniforms';

/**
 * GPU picking. The pick pass runs the draw pass's layout code into a 1×1 depth-tested
 * target (see pick.vert.glsl) and the nearest integer under the cursor comes back as one
 * RGBA8 pixel. No CPU-side spatial index, and it is right mid-morph because it shares the
 * morph code with the draw pass.
 */
export class Picker {
  private readonly target = new WebGLRenderTarget(1, 1, {
    type: UnsignedByteType,
    format: RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  });
  private readonly scene = new Scene();
  private readonly uniforms: { uCursor: IUniform<Vector2>; uMinHitPx: IUniform<number>; uMaxHitPx: IUniform<number> };
  private readonly material: RawShaderMaterial;
  private readonly pixel = new Uint8Array(4);

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly camera: Camera,
    geometry: BufferGeometry,
    shared: SharedUniforms,
  ) {
    this.uniforms = {
      uCursor: { value: new Vector2() },
      uMinHitPx: { value: 9 },
      uMaxHitPx: { value: 160 },
    };
    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      uniforms: { ...shared, ...this.uniforms },
      vertexShader: shaders.pickVertex,
      fragmentShader: shaders.pickFragment,
      blending: NoBlending,
      depthTest: true,
      depthWrite: true,
      transparent: false,
    });
    const points = new Points(geometry, this.material);
    points.frustumCulled = false;
    this.scene.add(points);
  }

  /**
   * Which integer is under (x, y)? Coordinates are CSS px from the canvas's top-left;
   * `pixelRatio` converts to the device px the shaders work in. Resolves to 0 for "nothing".
   */
  async pick(x: number, y: number, width: number, height: number, pixelRatio: number): Promise<number> {
    const { renderer } = this;
    this.uniforms.uCursor.value.set((x - width / 2) * pixelRatio, -(y - height / 2) * pixelRatio);
    this.uniforms.uMinHitPx.value = 9 * pixelRatio;
    this.uniforms.uMaxHitPx.value = 160 * pixelRatio;

    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
    renderer.setClearColor(0x03040a, 1);

    await renderer.readRenderTargetPixelsAsync(this.target, 0, 0, 1, 1, this.pixel);
    const [r, g, b, a] = this.pixel;
    return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
