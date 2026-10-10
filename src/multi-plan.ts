import { formatPlan } from './format.js';
import { objectHash } from './hash.js';
import { chromeApprovalHash, type ReconciliationPlan } from './reconcile.js';
import { firefoxApprovalHash, type FirefoxPlan } from './stores/firefox/plan.js';
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

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(entry => typeof entry === 'string');

function validChrome(value: unknown): value is ReconciliationPlan {
  return record(value) && value.schema === 'dashbye/plan/v2'
    && ['itemIdHash', 'artifactSha256', 'releaseHash', 'remoteHash', 'approvalHash'].every(key => typeof value[key] === 'string')
    && Array.isArray(value.operations) && value.operations.every(operation => record(operation)
      && ['area', 'action', 'field'].every(key => typeof operation[key] === 'string')
      && ['destructive', 'ownerApprovalRequired'].every(key => typeof operation[key] === 'boolean')
      && ['before', 'after'].every(key => operation[key] === null || ['string', 'number', 'boolean'].includes(typeof operation[key])));
}

function validFirefox(value: unknown): value is FirefoxPlan {
  return record(value) && value.schema === 'dashbye/firefox-plan/v1'
    && ['addonHash', 'slug', 'artifactSha256', 'releaseHash', 'remoteHash', 'approvalHash'].every(key => typeof value[key] === 'string')
    && record(value.version) && typeof value.version.local === 'string' && (value.version.remote === null || typeof value.version.remote === 'string')
    && Array.isArray(value.differences) && value.differences.every(difference => record(difference)
      && typeof difference.field === 'string' && ['update', 'remove', 'replace'].includes(String(difference.action))
      && ['before', 'after'].every(key => difference[key] === undefined || typeof difference[key] === 'number'))
    && strings(value.blocking);
}

export function parsePlanFile(raw: unknown): MultiPlan {
  const value = raw as (Omit<Partial<MultiPlan>, 'schema'> & { schema?: string }) | null;
  if (value?.schema === 'dashbye/plan/v2') throw new Error('this plan was made by an older DashBye; run dashbye plan again');
  if (value?.schema !== 'dashbye/plan/v3' || !record(value.stores) || !Array.isArray(value.pending)
    || !value.pending.every(store => STORE_IDS.includes(store)) || typeof value.approvalHash !== 'string'
    || Object.keys(value.stores).some(store => store !== 'chrome' && store !== 'firefox')
    || (value.stores.chrome !== undefined && !validChrome(value.stores.chrome))
    || (value.stores.firefox !== undefined && !validFirefox(value.stores.firefox))) {
    throw new Error('invalid plan file; run dashbye plan again');
  }
  const plan = value as MultiPlan;
  if ((plan.stores.chrome && chromeApprovalHash(plan.stores.chrome) !== plan.stores.chrome.approvalHash)
    || (plan.stores.firefox && firefoxApprovalHash(plan.stores.firefox) !== plan.stores.firefox.approvalHash)
    || combinePlans(plan.stores, plan.pending).approvalHash !== plan.approvalHash) {
    throw new Error('plan file was modified; run dashbye plan again');
  }
  return plan;
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
