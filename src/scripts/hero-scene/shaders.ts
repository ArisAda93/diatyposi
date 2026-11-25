/**
 * GLSL ES 1.00 shaders for the hero scene (WebGL 1 and 2).
 *
 * Light theme: the canvas is cleared to white and every colour pass blends with
 * gl.DST_COLOR × gl.ZERO, so inks multiply like overprinting on press (C + M → blue, M + Y → red,
 * C + Y → green); the canvas is composited onto the paper with `mix-blend-mode: multiply`, so
 * white is neutral. Dark theme: cleared to black, every colour pass screens
 * (gl.ONE × gl.ONE_MINUS_SRC_COLOR) and the canvas is composited with `mix-blend-mode: screen`, so
 * black is neutral and inks combine towards light (theme.ts). `uPaper` is that neutral colour:
 * whatever fades (uAlpha) fades towards it, so it leaves the page untouched in either theme.
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
 * light from the upper left so the depth reads. uAlpha fades the plate towards uPaper (no ink).
 */
export const plateFragment = /* glsl */ `${PRECISION}
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uAlpha;
varying vec3 vNormal;
varying float vWall;
void main() {
  vec3 n = normalize(vNormal);
  float lambert = clamp(dot(n, normalize(vec3(-0.55, 0.62, 0.56))), 0.0, 1.0);
  float shade = mix(1.0, mix(0.7, 0.95, lambert), vWall);
  gl_FragColor = vec4(mix(uPaper, uInk * shade, uAlpha), 1.0);
}
`;

/** Depth-only pass (colour writes are masked off while it runs). */
export const depthFragment = /* glsl */ `${PRECISION}
void main() {
  gl_FragColor = vec4(1.0);
}
`;

/**
 * Flat quad in group space (the contact shadow). The quad spans −0.5 to 0.5; vUv runs from −1 to
 * 1 across it.
 */
export const quadVertex = /* glsl */ `
attribute vec2 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
varying vec2 vUv;
void main() {
  vUv = position * 2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 0.0, 1.0);
}
`;

/**
 * Soft contact shadow under the plates: a gaussian ellipse of key ink that fades out well before
 * the quad's edge, so it never shows a border. In the dark theme the key is light, so it is a
 * faint glow instead.
 */
export const shadowFragment = /* glsl */ `${PRECISION}
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float d2 = dot(vUv, vUv);
  float a = exp(-d2 * 3.2) * (1.0 - smoothstep(0.6, 1.0, d2));
  gl_FragColor = vec4(mix(uPaper, uInk, a * uAlpha), 1.0);
}
`;
