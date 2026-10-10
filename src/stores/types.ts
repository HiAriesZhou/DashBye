export const STORE_IDS = ['chrome', 'edge', 'firefox'] as const;

export type StoreId = typeof STORE_IDS[number];

export const STORE_LABELS: Record<StoreId, string> = {
  chrome: 'Chrome Web Store',
  edge: 'Microsoft Edge Add-ons',
  firefox: 'Firefox Add-ons',
};

export function parseStoreList(value: string): StoreId[] {
  const requested = value.split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean);
  const unknown = requested.filter(entry => !(STORE_IDS as readonly string[]).includes(entry));
  if (unknown.length) throw new Error(`unknown store: ${unknown.join(', ')}; use ${STORE_IDS.join(', ')}`);
  if (!requested.length) throw new Error('choose at least one store');
  // Canonical order keeps plans, configs, and summaries stable.
  return STORE_IDS.filter(store => requested.includes(store));
}
