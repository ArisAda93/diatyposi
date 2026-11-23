/**
 * WebGL press for the journey stage (loaded on demand by ./index.ts, so OGL and the shader never
 * reach pages or screens that do not show the stage).
 *
 * One full-sheet triangle and one texture per step's photograph. The fragment shader separates the
 * photo into C, M, Y and K, and prints each separation as a halftone screen at its own angle, in
 * the site's process inks, multiplied onto the sheet like ink on paper: each dot's size comes from
 * the ink under its cell's centre, so the dots read as a real screen. Each plate can sit out of
 * register (its sheet position shifted), and the screens can resolve into continuous tone before
 * the true photo takes over (./state.ts sets every amount). Output is premultiplied alpha, so the
 * sheet can fade in over the page in either theme.
 */
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl';
import { PRINT_PLATES, type PrintState } from './state';

/** Context attributes: transparent canvas, premultiplied, nothing the sheet does not need. */
const GL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: 'low-power',
  failIfMajorPerformanceCaveat: true,
};

/** The page paper in light mode (#fafaf7), as the sheet's own white. */
const SHEET: readonly [number, number, number] = [0.98, 0.98, 0.969];

const vertex = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tMap;
uniform vec2 uRes;
uniform float uCell;
uniform float uPaper;
uniform vec4 uCover;
uniform vec4 uShiftX;
uniform vec4 uShiftY;
uniform vec4 uAngle;
uniform float uResolve;
uniform float uPhoto;
uniform float uEdge;
uniform vec3 uSheet;
uniform vec3 uInkY;
uniform vec3 uInkM;
uniform vec3 uInkC;
uniform vec3 uInkK;

// Naive separation: K from the darkest channel, then C, M, Y under it. Returns (c, m, y, k).
vec4 separate(vec3 rgb) {
  float k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
  vec3 cmy = (1.0 - rgb - k) / max(1.0 - k, 0.001);
  return vec4(cmy, k);
}

float onSheet(vec2 p) {
  return step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
}

// One plate's ink at this pixel: a halftone screen at 'angle', its sheet shifted by 'shift', its
// ink picked from the separation by 'pick', resolving to continuous tone with uResolve.
float plate(vec2 uv, vec2 shift, float angle, vec4 pick, float cover) {
  if (cover <= 0.0) return 0.0;
  vec2 p = uv - shift;
  float s = sin(angle);
  float c = cos(angle);
  vec2 px = p * uRes;
  vec2 g = mat2(c, -s, s, c) * px / uCell;
  vec2 centre = mat2(c, s, -s, c) * ((floor(g) + 0.5) * uCell) / uRes;
  float v = dot(separate(texture2D(tMap, clamp(centre, 0.0, 1.0)).rgb), pick) * cover;
  float r = sqrt(clamp(v, 0.0, 1.0)) * 0.7072;
  float aa = 1.0 / uCell;
  float dotInk = 1.0 - smoothstep(r - aa, r + aa, length(fract(g) - 0.5));
  float tone = dot(separate(texture2D(tMap, clamp(p, 0.0, 1.0)).rgb), pick) * cover;
  return mix(dotInk, tone, uResolve) * onSheet(p);
}

void main() {
  vec2 uv = vUv;
  float y = plate(uv, vec2(uShiftX.x, uShiftY.x), uAngle.x, vec4(0.0, 0.0, 1.0, 0.0), uCover.x);
  float m = plate(uv, vec2(uShiftX.y, uShiftY.y), uAngle.y, vec4(0.0, 1.0, 0.0, 0.0), uCover.y);
  float c = plate(uv, vec2(uShiftX.z, uShiftY.z), uAngle.z, vec4(1.0, 0.0, 0.0, 0.0), uCover.z);
  float k = plate(uv, vec2(uShiftX.w, uShiftY.w), uAngle.w, vec4(0.0, 0.0, 0.0, 1.0), uCover.w);
  vec3 col = uSheet;
  col *= mix(vec3(1.0), uInkY, y);
  col *= mix(vec3(1.0), uInkM, m);
  col *= mix(vec3(1.0), uInkC, c);
  col *= mix(vec3(1.0), uInkK, k);
  col = mix(col, texture2D(tMap, uv).rgb, uPhoto);
  // Light theme: the sheet's edge melts into the page paper; dark theme: a crisp print.
  vec2 e = min(uv, 1.0 - uv);
  float edge = mix(1.0, smoothstep(0.0, 0.07, min(e.x, e.y)), uEdge);
  float a = uPaper * edge;
  gl_FragColor = vec4(col * a, a);
}
`;

export interface PrintGL {
  /** Uploads step `index`'s photograph. */
  setPhoto(index: number, image: HTMLImageElement): void;
  /** Sizes the drawing buffer: CSS px and device pixel ratio. */
  resize(width: number, height: number, dpr: number): void;
  /** Draws step `index` at print state `state`; `cell` is the halftone pitch in CSS px. */
  draw(index: number, state: PrintState, options: { cell: number; softEdge: boolean }): void;
  clear(): void;
  destroy(): void;
}

/** Frees the GPU side of a canvas we will not use. */
const release = (canvas: HTMLCanvasElement): void => {
  try {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Nothing to release.
  }
};

/**
 * A press on `canvas` for `count` photographs, or null without a usable hardware context (no
 * WebGL, a software renderer, a failed shader). `onLost` runs once if the context is lost later.
 */
export const createPrintGL = (
  canvas: HTMLCanvasElement,
  count: number,
  onLost: () => void,
): PrintGL | null => {
  try {
    // Probe with our attributes first; OGL then reuses this context.
    const probe =
      canvas.getContext('webgl2', GL_ATTRIBUTES) ?? canvas.getContext('webgl', GL_ATTRIBUTES);
    if (!probe) return null;
    const renderer = new Renderer({
      canvas,
      dpr: 1,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const textures = Array.from(
      { length: count },
      () =>
        new Texture(gl, {
          generateMipmaps: false,
          minFilter: gl.LINEAR,
          magFilter: gl.LINEAR,
          wrapS: gl.CLAMP_TO_EDGE,
          wrapT: gl.CLAMP_TO_EDGE,
        }),
    );
    const [y, m, c, k] = PRINT_PLATES;
    if (!y || !m || !c || !k) return null;
    const uniforms = {
      tMap: { value: textures[0] },
      uRes: { value: [1, 1] },
      uCell: { value: 8 },
      uPaper: { value: 0 },
      uCover: { value: [0, 0, 0, 0] },
      uShiftX: { value: [0, 0, 0, 0] },
      uShiftY: { value: [0, 0, 0, 0] },
      uAngle: { value: PRINT_PLATES.map((p) => (p.angle * Math.PI) / 180) },
      uResolve: { value: 0 },
      uPhoto: { value: 0 },
      uEdge: { value: 1 },
      uSheet: { value: [...SHEET] },
      uInkY: { value: [...y.ink] },
      uInkM: { value: [...m.ink] },
      uInkC: { value: [...c.ink] },
      uInkK: { value: [...k.ink] },
    };
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms,
      transparent: false,
      depthTest: false,
      depthWrite: false,
    });
    // OGL only warns when a shader fails to compile or link; treat that as no press.
    if (gl.isContextLost() || !gl.getProgramParameter(program.program, gl.LINK_STATUS)) {
      program.remove();
      release(canvas);
      return null;
    }
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    let lost = false;
    const onContextLost = (event: Event): void => {
      event.preventDefault();
      if (lost) return;
      lost = true;
      onLost();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    let cssWidth = 1;
    let cssHeight = 1;
    let pixelRatio = 1;

    return {
      setPhoto(index, image) {
        const texture = textures[index];
        if (!texture || lost) return;
        texture.image = image;
        texture.update();
      },
      resize(width, height, dpr) {
        if (lost) return;
        cssWidth = Math.max(1, width);
        cssHeight = Math.max(1, height);
        pixelRatio = dpr;
        renderer.dpr = dpr;
        renderer.setSize(cssWidth, cssHeight);
        uniforms.uRes.value = [cssWidth * dpr, cssHeight * dpr];
      },
      draw(index, state, options) {
        const texture = textures[index];
        if (!texture || lost) return;
        uniforms.tMap.value = texture;
        uniforms.uCell.value = options.cell * pixelRatio;
        uniforms.uPaper.value = state.paper;
        uniforms.uCover.value = state.plates.map((p) => p.cover);
        // Offsets are a share of the sheet, y down; the sheet's uv runs y up.
        uniforms.uShiftX.value = PRINT_PLATES.map((p, j) => p.ox * (state.plates[j]?.shift ?? 0));
        uniforms.uShiftY.value = PRINT_PLATES.map((p, j) => -p.oy * (state.plates[j]?.shift ?? 0));
        uniforms.uResolve.value = state.resolve;
        uniforms.uPhoto.value = state.photo;
        uniforms.uEdge.value = options.softEdge ? 1 : 0;
        renderer.render({ scene: mesh });
      },
      clear() {
        if (lost) return;
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
      destroy() {
        canvas.removeEventListener('webglcontextlost', onContextLost);
        textures.forEach((texture) => {
          if (texture.texture) gl.deleteTexture(texture.texture);
        });
        program.remove();
        release(canvas);
      },
    };
  } catch {
    release(canvas);
    return null;
  }
};
