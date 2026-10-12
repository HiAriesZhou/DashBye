// While an item is in review the Dashboard renders every draft field disabled.
// Writes would time out on the first fill, so the lock is read with the draft and
// any write is refused before it starts. Only booleans are recorded.
export type EditLock = {
  pendingReview: boolean;
  listingFieldsDisabled: boolean;
  privacyFieldsDisabled: boolean;
};

export const UNLOCKED: EditLock = { pendingReview: false, listingFieldsDisabled: false, privacyFieldsDisabled: false };

export const IN_REVIEW_MESSAGE = 'item is in review; drafts cannot be edited until review completes';

export function isLocked(lock: EditLock): boolean {
  return lock.pendingReview || lock.listingFieldsDisabled || lock.privacyFieldsDisabled;
}

export function editLockReasons(lock: EditLock): string[] {
  if (lock.pendingReview) return [IN_REVIEW_MESSAGE];
  return [
    ...(lock.listingFieldsDisabled ? ['Store listing fields are read-only on the Dashboard'] : []),
    ...(lock.privacyFieldsDisabled ? ['Privacy fields are read-only on the Dashboard'] : []),
  ];
}

export class DraftLockedError extends Error {
  constructor(reasons: string[]) {
    super(`Chrome Web Store draft is not editable: ${reasons.join('; ')}. Nothing was written; run dashbye plan again once the draft is editable`);
    this.name = 'DraftLockedError';
  }
}

export function assertDraftEditable(lock: EditLock): void {
  if (isLocked(lock)) throw new DraftLockedError(editLockReasons(lock));
}

export function assertPlanWritable(plan: { blocking?: string[] }): void {
  if (plan.blocking?.length) throw new DraftLockedError(plan.blocking);
}
