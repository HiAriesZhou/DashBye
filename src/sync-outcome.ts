export type SyncOutcome = 'failed' | 'saved_and_reread' | 'draft_uploaded' | 'validated' | 'pending';

const FAILED = ['failed', 'validation_failed', 'upload_failed'];

// The run's headline result: any failure wins, then the strongest write.
export function syncOutcome(results: Record<string, { result: string } | undefined>): SyncOutcome {
  const entries = Object.values(results).filter(entry => entry !== undefined);
  if (entries.some(entry => FAILED.includes(entry.result))) return 'failed';
  for (const outcome of ['saved_and_reread', 'draft_uploaded', 'validated'] as const) {
    if (entries.some(entry => entry.result === outcome)) return outcome;
  }
  return 'pending';
}

export const isFailedResult = (result: string | undefined) => result !== undefined && FAILED.includes(result);
