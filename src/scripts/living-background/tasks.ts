/**
 * Cooperative scheduling for the living background's start-up: every step of it runs in its own
 * short task, and these helpers hand the main thread back to the browser in between, so input,
 * scrolling and the hero never wait behind the background (no long task on a slow phone).
 */

interface YieldingScheduler {
  yield?: () => Promise<void>;
}

/**
 * Ends the current task and continues in a new one as soon as possible: `scheduler.yield()` where
 * available (it keeps the continuation ahead of other queued work), otherwise a MessageChannel
 * message (not clamped like nested timeouts), otherwise a zero timeout.
 */
export const yieldToMain = (): Promise<void> => {
  const scheduler = (globalThis as { scheduler?: YieldingScheduler }).scheduler;
  if (typeof scheduler?.yield === 'function') return scheduler.yield();
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
};

/** Resolves at the next animation frame (paused while the tab is hidden). */
export const nextFrame = (): Promise<number> =>
  new Promise((resolve) => requestAnimationFrame(resolve));

/** Resolves after `ms` milliseconds. */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
