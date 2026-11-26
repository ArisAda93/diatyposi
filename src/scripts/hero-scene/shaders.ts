/**
 * GLSL ES 1.00 shaders for the hero's registration in depth (WebGL 1 and 2): the field of ink dust
 * and the plates.
 *
 * Light theme: the canvas is cleared to white and every colour pass blends with
 * gl.DST_COLOR × gl.ZERO, so inks multiply like overprinting on press (C + M → blue, M + Y → red,
 * C + Y → green); the canvas is composited onto the paper with `mix-blend-mode: multiply`, so
 * white is neutral. Dark theme: cleared to black, every colour pass screens
 * (gl.ONE × gl.ONE_MINUS_SRC_COLOR) and the canvas is composited with `mix-blend-mode: screen`, so
 * black is neutral and inks combine towards light (theme.ts). `uPaper` is that neutral colour:
 * whatever fades fades towards it, so nothing that is off ever tints the page, in either theme.
 *
 * Per frame (scene.ts): the dust in one draw of points (dustVertex, dustFragment: crisp specks at
 * many depths, smaller and fainter far behind the pivot's plane, and a few large soft bokeh specks
 * in front of it, kept faint under the copy and the header), then the plates (plateVertex,
 * plateFragment, each after its own depth pass, depthFragment), with the sheen across their faces
 * after the click.
 */
import { DUST_MASK } from './dust';

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
 *
 * uSheen (after the click): a soft slanted band of light across the front faces only, never the
 * walls, mixing the ink towards white (a lighter ink under multiply, a brighter light under
 * screen). x: the band's centre along the slant (gl_FragCoord.x + y × slant, device px), y: the
 * slant, z: half-width (device px), w: strength (0 = none).
 */
export const plateFragment = /* glsl */ `${PRECISION}
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uAlpha;
uniform vec4 uSheen;
varying vec3 vNormal;
varying float vWall;
void main() {
  vec3 n = normalize(vNormal);
  float lambert = clamp(dot(n, normalize(vec3(-0.55, 0.62, 0.56))), 0.0, 1.0);
  float shade = mix(1.0, mix(0.7, 0.95, lambert), vWall);
  vec3 ink = uInk * shade;
  if (uSheen.w > 0.0) {
    // Measured in half-widths and clamped, so far from the band it never gets squared large.
    float s = (gl_FragCoord.x + gl_FragCoord.y * uSheen.y - uSheen.x) / uSheen.z;
    s = clamp(s, -8.0, 8.0);
    ink = mix(ink, vec3(1.0), exp(-s * s) * uSheen.w * (1.0 - vWall));
  }
  gl_FragColor = vec4(mix(uPaper, ink, uAlpha), 1.0);
}
`;

/** Depth-only pass (colour writes are masked off while it runs). */
export const depthFragment = /* glsl */ `${PRECISION}
void main() {
  gl_FragColor = vec4(1.0);
}
`;

/**
 * The ink dust: one point per speck (dust.ts layDust), in the dust's frame (CSS px about the
 * pivot, y up, z towards the camera), which turns with the view.
 *
 * Attributes: position (the speck's place), home (where it gathers in the mark's footprint when
 * absorbed, z = 0), look (x ink 0 C, 1 M, 2 Y; y diameter on the pivot's plane, CSS px; z drift
 * phase, radians; w drift amplitude, CSS px), blur (edge softness: 0 crisp, up to 1 for the soft
 * bokeh specks in front of the plates).
 *
 * Uniforms:
 * - uMotion: x loop time (0 to PERIOD, s), y the loop's base angular frequency (2π / PERIOD; the
 *   drift uses whole multiples of it, so it is seamless where the loop wraps), z absorption (0–1),
 *   w its reach from the pivot (CSS px).
 * - uLens: x the camera's distance from the pivot's plane (the focus, CSS px), y the depth of the
 *   field behind it (CSS px), z the drawing DPR.
 * - uPoint: x the largest and y the smallest point (device px), z the share of the ink kept by a
 *   fully soft speck (bokeh) and w by the farthest ones (theme strengths, dust.ts dustLook).
 * - uAlpha: overall strength (the frame's fade times the theme's).
 *
 * A speck's size on screen follows its perspective; one smaller than the smallest point is drawn
 * at that size, fainter. Absorption pulls a speck towards its home, more the nearer it lies to the
 * pivot, and fades it as it goes (it is inside the plates). A speck that the view's turn brings
 * too close to the camera is moved outside the clip volume and drawn with no ink.
 */
export const dustVertex = /* glsl */ `
attribute vec3 position;
attribute vec2 home;
attribute vec4 look;
attribute float blur;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uCyan;
uniform vec3 uMagenta;
uniform vec3 uYellow;
uniform vec4 uMotion;
uniform vec3 uLens;
uniform vec4 uPoint;
uniform float uAlpha;
varying vec3 vInk;
varying float vAlpha;
varying float vSoft;

void main() {
  float t = uMotion.x * uMotion.y;
  float phase = look.z;
  vec3 wander = vec3(
    sin(t + phase),
    0.6 * sin(2.0 * t + phase * 1.7),
    0.8 * cos(t + phase * 0.6)
  );
  vec3 p = position + look.w * wander;

  float pull = uMotion.z * (1.0 - smoothstep(0.35, 1.0, length(position) / max(uMotion.w, 1.0)));
  p = mix(p, vec3(home, 0.0), pull);

  vec4 eye = modelViewMatrix * vec4(p, 1.0);
  float focus = uLens.x;
  float dist = -eye.z;
  float seen = step(focus * 0.08, dist);
  dist = max(dist, 1.0);
  float farness = clamp((dist - focus) / max(uLens.y, 1.0), 0.0, 1.0);

  // Diameter in device px, by perspective, between the smallest and the largest point.
  float px = look.y * (focus / dist) * uLens.z;
  float smallest = max(uPoint.y, 1.0);
  float size = clamp(px, smallest, max(uPoint.x, smallest));
  gl_PointSize = size;

  // Specks smaller than the smallest point print fainter instead of shrinking further.
  float tiny = clamp(px / smallest, 0.55, 1.0);
  vAlpha = uAlpha * seen * (1.0 - pull) * tiny *
    mix(1.0, uPoint.w, farness) * mix(1.0, uPoint.z, blur);
  // Edge softness as a share of the radius: about a device px for crisp specks, wide for bokeh.
  vSoft = clamp(max(blur, 1.6 / size), 0.0, 1.0);
  vInk = look.x < 0.5 ? uCyan : (look.x < 1.5 ? uMagenta : uYellow);

  gl_Position = seen > 0.5 ? projectionMatrix * eye : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

/**
 * One speck: a round dot with a soft edge (vSoft), its ink mixed towards uPaper by its strength.
 * Inside the copy's box and the header band (uCopyRect, uBandRect: device px in gl_FragCoord space,
 * min x, min y, max x, max y), and easing out over uFeather device px, it keeps at most
 * DUST_MASK.floor of its strength.
 */
export const dustFragment = /* glsl */ `${PRECISION}
uniform vec3 uPaper;
uniform vec4 uCopyRect;
uniform vec4 uBandRect;
uniform float uFeather;
varying vec3 vInk;
varying float vAlpha;
varying float vSoft;

const float MASK_FLOOR = ${DUST_MASK.floor.toFixed(3)};

// 1 inside the rectangle r (min x, min y, max x, max y), easing to 0 over feather outside it.
// Distances are measured in feathers and clamped first, so device px never get squared.
float nearRect(vec4 r, vec2 p, float feather) {
  vec2 d = clamp(max(r.xy - p, p - r.zw) / feather, -2.0, 2.0);
  float outside = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(0.0, 1.0, outside);
}

void main() {
  float r = length(gl_PointCoord * 2.0 - 1.0);
  float cover = 1.0 - smoothstep(1.0 - vSoft, 1.0, r);
  vec2 frag = gl_FragCoord.xy;
  float feather = max(uFeather, 1.0);
  float near = max(nearRect(uCopyRect, frag, feather), nearRect(uBandRect, frag, feather));
  float a = vAlpha * cover * (1.0 - (1.0 - MASK_FLOOR) * near);
  if (a < 0.002) discard;
  gl_FragColor = vec4(mix(uPaper, vInk, a), 1.0);
}
`;
