import { BITS_ROW_SHIFT, RADIAL_C, TRI_DY } from '../topology/constants';

import commonGlsl from './chunks/common.glsl?raw';
import uniformsGlsl from './chunks/uniforms.glsl?raw';
import topologiesGlsl from './chunks/topologies.glsl?raw';
import primesGlsl from './chunks/primes.glsl?raw';
import pointsVert from './points.vert.glsl?raw';
import pointsFrag from './points.frag.glsl?raw';
import pickVert from './pick.vert.glsl?raw';
import pickFrag from './pick.frag.glsl?raw';
import markerVert from './marker.vert.glsl?raw';
import markerFrag from './marker.frag.glsl?raw';
import gradeFrag from './grade.frag.glsl?raw';

/**
 * Three.js prepends `#version 300 es` (we pass glslVersion: GLSL3), so each source starts
 * with precision statements and the layout constants taken from the same TS module the CPU
 * mirror uses.
 */
const f = (x: number) => x.toPrecision(17);
const header = `
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2D;
#define RADIAL_C ${f(RADIAL_C)}
#define TRI_DY ${f(TRI_DY)}
#define ROW_SHIFT ${BITS_ROW_SHIFT}
#define ROW_MASK ${(1 << BITS_ROW_SHIFT) - 1}
`;

const vertexCore = [commonGlsl, uniformsGlsl, topologiesGlsl, primesGlsl];

const build = (...parts: string[]) => [header, ...parts].join('\n');

export const shaders = {
  pointsVertex: build(...vertexCore, pointsVert),
  pointsFragment: build(pointsFrag),
  pickVertex: build(...vertexCore, pickVert),
  pickFragment: build(pickFrag),
  markerVertex: build(...vertexCore, markerVert),
  markerFragment: build(markerFrag),
  /** For ShaderPass (ShaderMaterial), which supplies its own precision and uv/position. */
  gradeVertex: `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  gradeFragment: gradeFrag,
};
