/**
 * GLSL ES 1.00 shaders for the hero scene (WebGL 1 and 2).
 *
 * The canvas is cleared to white and every colour pass blends with gl.DST_COLOR × gl.ZERO, so
 * inks multiply like overprinting on press (C + M → blue, M + Y → red, C + Y → green). The canvas
 * itself is composited onto the paper with `mix-blend-mode: multiply`, so white is neutral.
 */

const PRECISION = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

/** The extruded arch plates. `wall` is 0 on the faces and 1 on the side walls. */
export const plateVertex = /* glsl */ `
attribute vec3 position;
attribute vec3 normal;
attribute float wall;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
varying vec3 vNormal;
varying float vWall;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vWall = wall;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Faces print the pure ink (identical to the SVG logo); the side walls are shaded by a soft key
 * light from the upper left so the depth reads. uAlpha fades the plate towards white (no ink).
 */
export const plateFragment = /* glsl */ `${PRECISION}
uniform vec3 uInk;
uniform float uAlpha;
varying vec3 vNormal;
varying float vWall;
void main() {
  vec3 n = normalize(vNormal);
  float lambert = clamp(dot(n, normalize(vec3(-0.55, 0.62, 0.56))), 0.0, 1.0);
  float shade = mix(1.0, mix(0.7, 0.95, lambert), vWall);
  gl_FragColor = vec4(mix(vec3(1.0), uInk * shade, uAlpha), 1.0);
}
`;

/** Depth-only pass (colour writes are masked off while it runs). */
export const depthFragment = /* glsl */ `${PRECISION}
void main() {
  gl_FragColor = vec4(1.0);
}
`;

/**
 * Ambient field: one small arch per instance on a tilted sheet. A slow travelling wave across the
 * whole sheet lifts and grows the arches like halftone dots; rings pulse out from the plates
 * (uSource), and near the pointer the arches swell and ripple outwards. `tone` picks the ink:
 * 0 key, 1 cyan, 2 magenta, 3 yellow.
 */
export const fieldVertex = /* glsl */ `
attribute vec2 position;
attribute vec2 cell;
attribute float tone;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uSpacing;
uniform vec2 uPointer;
uniform float uPointerAmt;
uniform vec2 uSource;
uniform float uSourceAmt;
uniform float uAspect;
uniform vec3 uInk;
uniform vec3 uCyan;
uniform vec3 uMagenta;
uniform vec3 uYellow;
varying float vInk;
varying float vDepth;
varying vec3 vColor;
void main() {
  vec2 base = cell * uSpacing;
  vec4 anchor = projectionMatrix * modelViewMatrix * vec4(base, 0.0, 1.0);
  vec2 ndc = anchor.xy / anchor.w;

  float w1 = sin(dot(cell, vec2(0.23, 0.17)) - uTime * 0.42);
  float w2 = sin(dot(cell, vec2(-0.11, 0.29)) - uTime * 0.27 + 1.7);
  vec2 s = (ndc - uSource) * vec2(uAspect, 1.0);
  float rs = length(s);
  float pulse = (0.5 + 0.5 * sin(rs * 9.0 - uTime * 1.1)) * exp(-rs * 1.4) * uSourceAmt;
  float wave = clamp(0.42 + 0.3 * w1 + 0.16 * w2 + 0.3 * pulse, 0.0, 1.0);
  wave = wave * wave * (3.0 - 2.0 * wave);

  vec2 d = (ndc - uPointer) * vec2(uAspect, 1.0);
  float r = length(d);
  float near = exp(-r * r * 9.0) * uPointerAmt;
  float ring = sin(r * 18.0 - uTime * 2.4) * exp(-r * 3.2) * uPointerAmt;

  float size = uSpacing * (0.12 + 0.42 * wave + 0.22 * near + 0.05 * ring);
  float lift = uSpacing * (0.9 * wave + 1.6 * near + 0.4 * ring);
  vec4 mv = modelViewMatrix * vec4(base + position * size, lift, 1.0);

  vec3 color = uInk;
  color = mix(color, uCyan, step(0.5, tone) * (1.0 - step(1.5, tone)));
  color = mix(color, uMagenta, step(1.5, tone) * (1.0 - step(2.5, tone)));
  color = mix(color, uYellow, step(2.5, tone));
  vColor = color;
  vInk = 0.3 + 0.7 * wave + 0.7 * near;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

/**
 * Ink at moderate strength across the whole sheet. It is reduced (never removed) behind the text
 * (uClear, a CSS-px box in canvas space, feathered), in the header band (above uTop) and at the
 * foot of the hero, capped so text over it keeps AA contrast, and fogged with distance so the
 * sheet never shows a hard horizon.
 */
export const fieldFragment = /* glsl */ `${PRECISION}
uniform float uAlpha;
uniform vec2 uSize;
uniform float uDpr;
uniform vec4 uClear;
uniform float uTop;
uniform float uFar;
varying float vInk;
varying float vDepth;
varying vec3 vColor;
float boxDistance(vec2 p, vec4 box) {
  vec2 c = (box.xy + box.zw) * 0.5;
  vec2 h = (box.zw - box.xy) * 0.5;
  vec2 q = abs(p - c) - h;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y * uDpr - gl_FragCoord.y) / uDpr;
  float mask = mix(0.18, 1.0, smoothstep(0.0, 120.0, boxDistance(px, uClear)));
  mask *= mix(0.3, 1.0, smoothstep(uTop, uTop + 60.0, px.y));
  mask *= mix(0.35, 1.0, 1.0 - smoothstep(uSize.y - 140.0, uSize.y, px.y));
  float fog = 1.0 - smoothstep(uFar * 0.6, uFar, vDepth);
  float a = clamp(uAlpha * vInk * mask * fog, 0.0, 0.45);
  gl_FragColor = vec4(mix(vec3(1.0), vColor, a), 1.0);
}
`;
