export type ReadBackOptions = {
  attempts: number;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
};

export type ReadBackResult<T> = { state: T; remaining: number; rereads: number };

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// The Dashboard can briefly report pre-save state while it processes a saved
// draft (for example, uploaded artwork), and a reload can be refused while a save
// is still in flight. Reading is read-only; no write is repeated. A failed read
// counts as unsettled, and a difference or failure that outlives every attempt
// is still a failure.
export async function settleReadBack<T>(
  read: () => Promise<T>,
  remainingOperations: (state: T) => number,
  options: ReadBackOptions,
): Promise<ReadBackResult<T>> {
  if (!Number.isInteger(options.attempts) || options.attempts < 0) throw new Error('read-back attempts must be a non-negative integer');
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) throw new Error('read-back delayMs must be a non-negative number');
  const sleep = options.sleep ?? defaultSleep;
  for (let rereads = 0; ; rereads += 1) {
    if (rereads > 0) await sleep(options.delayMs);
    const last = rereads === options.attempts;
    try {
      const state = await read();
      const remaining = remainingOperations(state);
      if (remaining === 0 || last) return { state, remaining, rereads };
    } catch (error) {
      if (last) throw error;
    }
  }
}
