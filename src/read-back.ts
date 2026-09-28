export type ReadBackOptions = {
  attempts: number;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
};

export type ReadBackResult<T> = { state: T; remaining: number; rereads: number };

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// The Dashboard can briefly report pre-save state while it processes a saved
// draft (for example, uploaded artwork). Rereading is read-only; no write is
// repeated, and a difference that outlives every attempt is still a failure.
export async function settleReadBack<T>(
  initial: T,
  reread: () => Promise<T>,
  remainingOperations: (state: T) => number,
  options: ReadBackOptions,
): Promise<ReadBackResult<T>> {
  if (!Number.isInteger(options.attempts) || options.attempts < 0) throw new Error('read-back attempts must be a non-negative integer');
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) throw new Error('read-back delayMs must be a non-negative number');
  const sleep = options.sleep ?? defaultSleep;
  let result: ReadBackResult<T> = { state: initial, remaining: remainingOperations(initial), rereads: 0 };
  while (result.remaining > 0 && result.rereads < options.attempts) {
    await sleep(options.delayMs);
    const state = await reread();
    result = { state, remaining: remainingOperations(state), rereads: result.rereads + 1 };
  }
  return result;
}
