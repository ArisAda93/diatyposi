/**
 * The /etaireia/ work-table photo as a depth-parallax scene (OGL / WebGL): one full-screen
 * triangle that reads the photo through the camera of ./math.ts (centre, zoom, parallax shift
 * around a focus depth) from the photo and its depth map, and lightly dims everything outside a
 * soft spotlight on the focused step. Returns null without a usable hardware context (no WebGL, a
 * software renderer, a failed shader), so the plain photo stays.
 */
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl';
import type { Point } from './math';

/** Transparent, premultiplied, nothing the scene does not need; no software rendering. */
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

const vertex = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Screen and photo coordinates run y down here (as in ./math.ts); textures are sampled y up.
const fragment = /* glsl */ `
precision highp float;
uniform sampler2D tMap;
uniform sampler2D tDepth;
uniform vec2 uCenter;
uniform float uZoom;
uniform vec2 uShift;
uniform float uFocusDepth;
uniform vec2 uSpot;
uniform float uSpotOn;
uniform float uAspect;
varying vec2 vUv;

vec2 texUv(vec2 p) { return vec2(p.x, 1.0 - p.y); }

void main() {
  vec2 s = vec2(vUv.x, 1.0 - vUv.y);
  vec2 v = (s - 0.5) / uZoom + uCenter;
  float d = texture2D(tDepth, texUv(v)).r;
  vec2 p = v + uShift * (d - uFocusDepth);
  vec3 col = texture2D(tMap, texUv(p)).rgb;
  // Spotlight: a soft pool of light on the focused step, the rest of the table a touch darker.
  vec2 q = (s - uSpot) * vec2(uAspect, 1.0);
  float pool = 1.0 - smoothstep(0.12, 0.62, length(q));
  col *= mix(1.0, 0.8 + 0.28 * pool, uSpotOn);
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface SceneCamera {
  center: Point;
  zoom: number;
  shift: Point;
  focusDepth: number;
  /** Spotlight centre in the view (0–1) and strength (0–1). */
  spot: Point;
  spotOn: number;
}

export interface WorkbenchGL {
  resize(width: number, height: number, dpr: number): void;
  draw(camera: SceneCamera): void;
  destroy(): void;
}

const release = (canvas: HTMLCanvasElement): void => {
  try {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Nothing to release.
  }
};

/** The scene on `canvas` for `photo` and its `depth` map, or null (see the header). */
export const createWorkbenchGL = (
  canvas: HTMLCanvasElement,
  photo: HTMLImageElement,
  depth: HTMLImageElement,
  onLost: () => void,
): WorkbenchGL | null => {
  try {
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
    const texture = (image: HTMLImageElement): Texture =>
      new Texture(gl, {
        image,
        generateMipmaps: false,
        minFilter: gl.LINEAR,
        magFilter: gl.LINEAR,
        wrapS: gl.CLAMP_TO_EDGE,
        wrapT: gl.CLAMP_TO_EDGE,
      });
    const uniforms = {
      tMap: { value: texture(photo) },
      tDepth: { value: texture(depth) },
      uCenter: { value: [0.5, 0.5] },
      uZoom: { value: 1 },
      uShift: { value: [0, 0] },
      uFocusDepth: { value: 0.5 },
      uSpot: { value: [0.5, 0.5] },
      uSpotOn: { value: 0 },
      uAspect: { value: 4 / 3 },
    };
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms,
      transparent: false,
      depthTest: false,
      depthWrite: false,
    });
    // OGL only warns when a shader fails; treat that as no scene.
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

    return {
      resize(width, height, dpr) {
        if (lost) return;
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, width), Math.max(1, height));
        uniforms.uAspect.value = width > 0 && height > 0 ? width / height : 4 / 3;
      },
      draw(camera) {
        if (lost) return;
        uniforms.uCenter.value = [camera.center.x, camera.center.y];
        uniforms.uZoom.value = camera.zoom;
        uniforms.uShift.value = [camera.shift.x, camera.shift.y];
        uniforms.uFocusDepth.value = camera.focusDepth;
        uniforms.uSpot.value = [camera.spot.x, camera.spot.y];
        uniforms.uSpotOn.value = camera.spotOn;
        renderer.render({ scene: mesh });
      },
      destroy() {
        canvas.removeEventListener('webglcontextlost', onContextLost);
        program.remove();
        release(canvas);
      },
    };
  } catch {
    release(canvas);
    return null;
  }
};
