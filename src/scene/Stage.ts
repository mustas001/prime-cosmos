import {
  HalfFloatType,
  NeutralToneMapping,
  OrthographicCamera,
  Scene,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { shaders } from '../shaders';

/**
 * WebGL2 renderer plus the post chain:
 *   additive HDR scene  →  bloom  →  tone-map + sRGB  →  grade (vignette, dither).
 *
 * The scene itself never uses the camera matrices — every shader takes the 2-D view as
 * uniforms — so the camera here is only a formality for `renderer.render`.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private frame = 0;

  /** Largest sprite the GPU will rasterise, in device px. */
  readonly maxPointSize: number;

  width = 1;
  height = 1;
  pixelRatio = 1;
  private maxDpr = 2;
  private resolutionScale = 1;

  constructor(private readonly host: HTMLElement) {
    const renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer = renderer;
    renderer.setClearColor(0x03040a, 1);
    renderer.autoClear = true;
    // Three sorts by bounding sphere, which would read past the one-vertex backing buffer of
    // the virtual-count point cloud. Draw order is just insertion order here.
    renderer.sortObjects = false;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.className = 'absolute inset-0 h-full w-full';
    host.appendChild(renderer.domElement);

    const gl = renderer.getContext();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    this.maxPointSize = Math.max(16, range[1]);

    const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    const target = new WebGLRenderTarget(1, 1, { type: hdr ? HalfFloatType : UnsignedByteType });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.85, 0.5, 0.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new Vector2(1, 1) },
        uVignette: { value: 0.65 },
        uSeed: { value: 0 },
      },
      vertexShader: shaders.gradeVertex,
      fragmentShader: shaders.gradeFragment,
    });
    this.composer.addPass(this.grade);
  }

  /** Resize to the host element. Returns the drawing-buffer size in device px. */
  resize(): Vector2 {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this.maxDpr) * this.resolutionScale;
    this.width = w;
    this.height = h;
    this.pixelRatio = pr;

    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr, h * pr);

    const size = new Vector2(w * pr, h * pr);
    (this.grade.uniforms.uResolution.value as Vector2).copy(size);
    return size;
  }

  /** Cap the device pixel ratio and apply a further render-scale factor. Call resize() after. */
  setQuality(maxDpr: number, scale: number): void {
    this.maxDpr = maxDpr;
    this.resolutionScale = scale;
  }

  setBloom(strength: number, threshold: number, radius: number): void {
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.bloom.radius = radius;
    this.bloom.enabled = strength > 0.001;
  }

  setExposure(exposure: number): void {
    this.renderer.toneMappingExposure = exposure;
  }

  render(): void {
    this.grade.uniforms.uSeed.value = (this.frame++ % 997) * 1.618;
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
