import { formatPlan } from './format.js';
import { objectHash } from './hash.js';
import { chromeApprovalHash, type ReconciliationPlan } from './reconcile.js';
import { edgeApprovalHash, type EdgePlan } from './stores/edge/index.js';
import { firefoxApprovalHash, writableDifferences, type FirefoxPlan } from './stores/firefox/plan.js';
import { parseStoreList, STORE_IDS, STORE_LABELS, type StoreId } from './stores/types.js';

// Stores that can execute in this version. Configured stores without an adapter
// are carried as "pending" so the plan shows them instead of silently skipping.
export type StorePlans = { chrome?: ReconciliationPlan; edge?: EdgePlan; firefox?: FirefoxPlan };

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
    && (value.blocking === undefined || strings(value.blocking))
    && Array.isArray(value.operations) && value.operations.every(operation => record(operation)
      && ['area', 'action', 'field'].every(key => typeof operation[key] === 'string')
      && ['destructive', 'ownerApprovalRequired'].every(key => typeof operation[key] === 'boolean')
      && ['before', 'after'].every(key => operation[key] === null || ['string', 'number', 'boolean'].includes(typeof operation[key])));
}

function validFirefox(value: unknown): value is FirefoxPlan {
  return record(value) && value.schema === 'dashbye/firefox-plan/v2' && (value.mode === 'validate' || value.mode === 'listing')
    && ['addonHash', 'slug', 'artifactSha256', 'releaseHash', 'remoteHash', 'approvalHash'].every(key => typeof value[key] === 'string')
    && record(value.version) && typeof value.version.local === 'string' && (value.version.remote === null || typeof value.version.remote === 'string')
    && Array.isArray(value.differences) && value.differences.every(difference => record(difference)
      && typeof difference.field === 'string' && ['update', 'remove', 'replace'].includes(String(difference.action))
      && ['before', 'after'].every(key => difference[key] === undefined || typeof difference[key] === 'number'))
    && strings(value.blocking);
}

function validEdge(value: unknown): value is EdgePlan {
  return record(value) && value.schema === 'dashbye/edge-plan/v1'
    && ['productIdHash', 'artifactSha256', 'version', 'approvalHash'].every(key => typeof value[key] === 'string')
    && Array.isArray(value.operations) && value.operations.every(operation => record(operation)
      && operation.area === 'package' && operation.action === 'upload' && operation.field === 'draftPackage' && typeof operation.after === 'string')
    && strings(value.blocking);
}

export function parsePlanFile(raw: unknown): MultiPlan {
  const value = raw as (Omit<Partial<MultiPlan>, 'schema'> & { schema?: string }) | null;
  if (value?.schema === 'dashbye/plan/v2') throw new Error('this plan was made by an older DashBye; run dashbye plan again');
  if (value?.schema !== 'dashbye/plan/v3' || !record(value.stores) || !Array.isArray(value.pending)
    || !value.pending.every(store => STORE_IDS.includes(store)) || typeof value.approvalHash !== 'string'
    || Object.keys(value.stores).some(store => !STORE_IDS.includes(store as StoreId))
    || (value.stores.chrome !== undefined && !validChrome(value.stores.chrome))
    || (value.stores.edge !== undefined && !validEdge(value.stores.edge))
    || (value.stores.firefox !== undefined && !validFirefox(value.stores.firefox))) {
    throw new Error('invalid plan file; run dashbye plan again');
  }
  const plan = value as MultiPlan;
  if ((plan.stores.chrome && chromeApprovalHash(plan.stores.chrome) !== plan.stores.chrome.approvalHash)
    || (plan.stores.firefox && firefoxApprovalHash(plan.stores.firefox) !== plan.stores.firefox.approvalHash)
    || (plan.stores.edge && edgeApprovalHash(plan.stores.edge) !== plan.stores.edge.approvalHash)
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

export function storesToRun(plan: MultiPlan, requested?: string): { run: StoreId[]; pending: StoreId[] } {
  const planned = Object.keys(plan.stores) as StoreId[];
  const selected = selectStores([...planned, ...plan.pending], requested);
  return { run: selected.filter(store => planned.includes(store)), pending: selected.filter(store => plan.pending.includes(store)) };
}

export function planForRun(plan: MultiPlan, run: StoreId[], pending: StoreId[]): Pick<MultiPlan, 'stores' | 'pending'> {
  return { stores: {
    ...(run.includes('chrome') ? { chrome: plan.stores.chrome } : {}),
    ...(run.includes('edge') ? { edge: plan.stores.edge } : {}),
    ...(run.includes('firefox') ? { firefox: plan.stores.firefox } : {}),
  }, pending };
}

const indent = (text: string) => text.split('\n').map(line => `  ${line}`).join('\n');

export function formatMultiPlan(plan: Pick<MultiPlan, 'stores' | 'pending'>, targets: { chrome?: { itemId: string; language: string } }): string {
  const sections = STORE_IDS.flatMap(store => {
    if (store === 'chrome' && plan.stores.chrome && targets.chrome) return [`${STORE_LABELS.chrome}\n${indent(formatPlan(plan.stores.chrome, targets.chrome))}`];
    if (store === 'edge' && plan.stores.edge) return [`${STORE_LABELS.edge}\n${indent(formatEdge(plan.stores.edge))}`];
    if (store === 'firefox' && plan.stores.firefox) return [`${STORE_LABELS.firefox}\n${indent(formatFirefox(plan.stores.firefox))}`];
    if (plan.pending.includes(store)) return [`${STORE_LABELS[store]}\n  Not supported in this DashBye version yet; nothing will be written.`];
    return [];
  });
  return sections.join('\n\n');
}

function formatEdge(plan: EdgePlan): string {
  const lines = [plan.operations.length ? `Package ${plan.version} → draft submission` : `Package ${plan.version} is already in the draft submission`];
  for (const reason of plan.blocking) lines.push(`Blocked: ${reason}`);
  lines.push('Store listing and publishing stay in Partner Center.');
  return lines.join('\n');
}

const fieldLines = (differences: FirefoxPlan['differences']) => differences.map(difference =>
  `  ${difference.field}${difference.before !== undefined ? ` (${difference.before} → ${difference.after})` : ''}`);

function formatFirefox(plan: FirefoxPlan): string {
  const lines = [`Package ${plan.version.local} (AMO: ${plan.version.remote ?? 'no version yet'})`];
  if (!plan.differences.length) lines.push('Listing matches AMO.');
  else if (plan.mode === 'validate') lines.push(`Listing changes wait until AMO approves ${plan.version.local}:`, ...fieldLines(plan.differences));
  else {
    const writable = writableDifferences(plan.differences);
    const manual = plan.differences.filter(difference => !writable.includes(difference));
    if (writable.length) lines.push(`AMO approved ${plan.version.local}. sync-draft updates:`, ...fieldLines(writable));
    if (manual.length) lines.push('Update by hand in AMO Developer Hub:', ...fieldLines(manual));
  }
  for (const reason of plan.blocking) lines.push(`Blocked: ${reason}`);
  if (plan.mode === 'validate') lines.push('sync-draft uploads the package to AMO for validation only; submit it with dashbye submit.');
  return lines.join('\n');
}

export function confirmQuestion(plan: Pick<MultiPlan, 'stores'>): string {
  const { chrome, edge, firefox } = plan.stores;
  const parts = [
    ...(chrome ? [chrome.operations.length ? 'save these changes to the Dashboard draft' : 'verify the draft and record the release lock'] : []),
    ...(edge?.operations.length ? ['upload the Edge package to its draft'] : []),
    ...(firefox ? [firefox.mode === 'listing' ? 'update the AMO listing' : chrome ? 'validate the Firefox package on AMO' : 'upload the Firefox package to AMO for validation'] : []),
  ];
  const sentence = parts.join(' and ') || 'continue';
  return `${sentence[0]!.toUpperCase()}${sentence.slice(1)}?`;
}
