import { formatPlan } from './format.js';
import { objectHash } from './hash.js';
import type { ReconciliationPlan } from './reconcile.js';
import type { FirefoxPlan } from './stores/firefox/plan.js';
import { parseStoreList, STORE_IDS, STORE_LABELS, type StoreId } from './stores/types.js';

// Stores that can execute in this version. Configured stores without an adapter
// are carried as "pending" so the plan shows them instead of silently skipping.
export type StorePlans = { chrome?: ReconciliationPlan; firefox?: FirefoxPlan };

export type MultiPlan = {
  schema: 'dashbye/plan/v3';
  stores: StorePlans;
  pending: StoreId[];
  approvalHash: string;
};

export function combinePlans(stores: StorePlans, pending: StoreId[]): MultiPlan {
  const bound = {
    schema: 'dashbye/plan/v3' as const,
    stores: Object.fromEntries(Object.entries(stores).map(([store, plan]) => [store, plan.approvalHash])),
    pending: [...pending].sort(),
  };
  return { schema: 'dashbye/plan/v3', stores, pending: bound.pending as StoreId[], approvalHash: objectHash(bound) };
}

export function parsePlanFile(raw: unknown): MultiPlan {
  const value = raw as (Omit<Partial<MultiPlan>, 'schema'> & { schema?: string }) | null;
  if (value?.schema === 'dashbye/plan/v2') throw new Error('this plan was made by an older DashBye; run dashbye plan again');
  if (value?.schema !== 'dashbye/plan/v3' || !value.stores || typeof value.stores !== 'object' || !Array.isArray(value.pending) || typeof value.approvalHash !== 'string') {
    throw new Error('invalid plan file; run dashbye plan again');
  }
  return value as unknown as MultiPlan;
}

export function selectStores(configured: StoreId[], requested?: string): StoreId[] {
  if (!requested) return configured;
  const stores = parseStoreList(requested);
  const missing = stores.filter(store => !configured.includes(store));
  if (missing.length) throw new Error(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not configured; configured stores: ${configured.join(', ')}. Run dashbye init to change stores`);
  return stores;
}

const indent = (text: string) => text.split('\n').map(line => `  ${line}`).join('\n');

export function formatMultiPlan(plan: MultiPlan, targets: { chrome?: { itemId: string; language: string } }): string {
  const sections = STORE_IDS.flatMap(store => {
    if (store === 'chrome' && plan.stores.chrome && targets.chrome) return [`${STORE_LABELS.chrome}\n${indent(formatPlan(plan.stores.chrome, targets.chrome))}`];
    if (store === 'firefox' && plan.stores.firefox) return [`${STORE_LABELS.firefox}\n${indent(formatFirefox(plan.stores.firefox))}`];
    if (plan.pending.includes(store)) return [`${STORE_LABELS[store]}\n  Not supported in this DashBye version yet; nothing will be written.`];
    return [];
  });
  return sections.join('\n\n');
}

function formatFirefox(plan: FirefoxPlan): string {
  const lines = [`Package ${plan.version.local} (AMO: ${plan.version.remote ?? 'no version yet'})`];
  if (plan.differences.length) {
    lines.push('Update by hand in AMO Developer Hub:');
    for (const difference of plan.differences) {
      const counts = difference.before !== undefined ? ` (${difference.before} → ${difference.after})` : '';
      lines.push(`  ${difference.field}${counts}`);
    }
  } else {
    lines.push('Listing matches AMO.');
  }
  for (const reason of plan.blocking) lines.push(`Blocked: ${reason}`);
  lines.push('sync-draft uploads the package to AMO for validation only; it does not create a version or submit for review.');
  return lines.join('\n');
}

export function confirmQuestion(plan: MultiPlan): string {
  const chrome = plan.stores.chrome;
  const parts = [
    ...(chrome ? [chrome.operations.length ? 'Save these changes to the Dashboard draft' : 'Verify the draft and record the release lock'] : []),
    ...(plan.stores.firefox ? [chrome ? 'validate the Firefox package on AMO' : 'Upload the Firefox package to AMO for validation'] : []),
  ];
  return `${parts.join(' and ') || 'Continue'}?`;
}
