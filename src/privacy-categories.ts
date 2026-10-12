// Chrome Web Store "data usage" categories: release.yml identifier → Dashboard checkbox label.
export const COLLECTED_DATA_LABELS = {
  personallyIdentifiableInformation: 'Personally identifiable information',
  healthInformation: 'Health information',
  financialAndPaymentInformation: 'Financial and payment information',
  authenticationInformation: 'Authentication information',
  personalCommunications: 'Personal communications',
  location: 'Location',
  webHistory: 'Web history',
  userActivity: 'User activity',
  websiteContent: 'Website content',
} as const;

export type CollectedDataCategory = keyof typeof COLLECTED_DATA_LABELS;

export const COLLECTED_DATA_CATEGORIES = Object.keys(COLLECTED_DATA_LABELS) as CollectedDataCategory[];

export function isCollectedDataCategory(value: string): value is CollectedDataCategory {
  return Object.hasOwn(COLLECTED_DATA_LABELS, value);
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution));
    }
    previous = current;
  }
  return previous[right.length]!;
}

export function closestCollectedDataCategory(value: string): CollectedDataCategory {
  const needle = value.toLowerCase();
  const scored = COLLECTED_DATA_CATEGORIES.map(category => ({ category, distance: editDistance(needle, category.toLowerCase()) }));
  return scored.reduce((best, candidate) => (candidate.distance < best.distance ? candidate : best)).category;
}
