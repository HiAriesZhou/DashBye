export function syncOutcome(results: Record<string, { result: string } | undefined>): 'failed' | 'saved_and_reread' | 'validated' | 'pending' {
  const entries = Object.values(results).filter(entry => entry !== undefined);
  if (entries.some(entry => entry.result === 'failed' || entry.result === 'validation_failed')) return 'failed';
  if (!entries.length) return 'pending';
  if (entries.some(entry => entry.result === 'saved_and_reread')) return 'saved_and_reread';
  return entries.some(entry => entry.result === 'validated') ? 'validated' : 'pending';
}
