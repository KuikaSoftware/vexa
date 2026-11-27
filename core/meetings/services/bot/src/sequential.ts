/**
 * Runs the calls of an async function one after another, in call order. A call that fails does not
 * hold up the ones after it; its own caller still sees the failure.
 *
 * Node-only, no imports → gate:isolation-clean.
 */
export function sequential<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (...args: A): Promise<void> => {
    const run = tail.then(() => fn(...args));
    tail = run.catch(() => { /* the caller of this run handles it */ });
    return run;
  };
}
