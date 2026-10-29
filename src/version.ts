// Dotted extension versions (Chrome, Edge, Firefox), compared part by part as numbers.
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(part => Number.parseInt(part, 10) || 0);
  const b = right.split('.').map(part => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

// The Chrome Web Store Dashboard shows the draft package version in free text beside
// dates and file sizes, so only three- or four-part versions can be told apart there.
const DASHBOARD_VERSION = String.raw`\d+\.\d+\.\d+(?:\.\d+)?`;

export const dashboardVersionPattern = (flags = '') => new RegExp(String.raw`\b${DASHBOARD_VERSION}\b`, flags);

export const isDashboardReadableVersion = (version: string) => new RegExp(`^${DASHBOARD_VERSION}$`).test(version);
