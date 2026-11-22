/**
 * Start-up helpers for the hero scene, so building it never blocks the main thread for long on a
 * slow phone:
 *  - yieldToMain hands control back to the browser between the steps of building the scene
 *    (scheduler.yield() where available, otherwise a MessageChannel task), so input and painting
 *    can run in between;
 *  - precompile compiles and links the scene's shaders in the background where the browser offers
 *    KHR_parallel_shader_compile, polling for completion across frames. OGL then compiles the
 *    same sources again when it builds its programs; the browser's program cache answers those
 *    from the finished links, so they no longer stall the thread.
 */

interface YieldingScheduler {
  yield: () => Promise<void>;
}

const hasYield = (value: unknown): value is YieldingScheduler =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { yield?: unknown }).yield === 'function';

/** Ends the current task and resumes in a new one (ahead of other queued tasks where possible). */
export const yieldToMain = (): Promise<void> => {
  const scheduler: unknown = Reflect.get(globalThis, 'scheduler');
  if (hasYield(scheduler)) return scheduler.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** How often to check whether the background links have finished (ms). */
const POLL_MS = 16;

/**
 * Compiles and links `sources` in the background (KHR_parallel_shader_compile) and resolves once
 * every link has finished or `timeoutMs` has passed. Without the extension it resolves at once:
 * the programs are then compiled one per task by the caller. Never throws for a shader error;
 * the caller's own link check reports that.
 */
export const precompile = async (
  gl: WebGLRenderingContextBase,
  sources: readonly { vertex: string; fragment: string }[],
  timeoutMs: number,
): Promise<void> => {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  if (!parallel) return;

  const shaders: WebGLShader[] = [];
  const programs: WebGLProgram[] = [];
  for (const { vertex, fragment } of sources) {
    const program = gl.createProgram();
    if (!program) continue;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) continue;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
      shaders.push(shader);
    }
    gl.linkProgram(program);
    programs.push(program);
  }

  const started = performance.now();
  const pending = (): boolean =>
    !gl.isContextLost() &&
    programs.some((p) => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR) !== true);
  while (pending() && performance.now() - started < timeoutMs) await wait(POLL_MS);

  // Only the finished links were wanted (they fill the program cache); drop these copies.
  programs.forEach((p) => gl.deleteProgram(p));
  shaders.forEach((s) => gl.deleteShader(s));
};
