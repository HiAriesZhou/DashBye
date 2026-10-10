export function syncOutcome(results: Record<string, { result: string } | undefined>): 'failed' | 'saved_and_reread' | 'pending' {
  const entries = Object.values(results).filter(entry => entry !== undefined);
  if (entries.some(entry => entry.result === 'failed' || entry.result === 'validation_failed')) return 'failed';
  return entries.length ? 'saved_and_reread' : 'pending';
}
