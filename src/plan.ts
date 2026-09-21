import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { DashboardSnapshot, DraftPlan, ResolvedStoreConfig } from './types.js';

export function createPlan(config: ResolvedStoreConfig, current: DashboardSnapshot): DraftPlan {
  if (config.language !== current.language) throw new Error('Dashboard language does not match config');
  const desiredDescriptionHash = createHash('sha256').update(config.descriptionText).digest('hex');
  const localCount = config.assets.localizedScreenshots.length;
  const globalCount = config.assets.globalScreenshots.length;
  if (current.localizedScreenshotCount > localCount || current.globalScreenshotCount > globalCount) {
    throw new Error('Dashboard contains more screenshots than configured; append-only sync refused');
  }
  return {
    itemId: current.itemId,
    language: current.language,
    description: desiredDescriptionHash === current.descriptionSha256 ? 'unchanged' : 'update',
    appendLocalizedScreenshots: config.assets.localizedScreenshots.slice(current.localizedScreenshotCount),
    appendGlobalScreenshots: config.assets.globalScreenshots.slice(current.globalScreenshotCount),
    uploadIcon: config.assets.icon && !current.hasIcon ? config.assets.icon : null,
    uploadSmallPromo: config.assets.smallPromo && !current.hasSmallPromo ? config.assets.smallPromo : null,
    uploadMarqueePromo: config.assets.marqueePromo && !current.hasMarqueePromo ? config.assets.marqueePromo : null,
    requiresExistingPrefixConfirmation:
      (current.localizedScreenshotCount > 0 && current.localizedScreenshotCount < localCount)
      || (current.globalScreenshotCount > 0 && current.globalScreenshotCount < globalCount),
  };
}

export function publicPlan(plan: DraftPlan) {
  const { itemId: _itemId, ...publicFields } = plan;
  return {
    itemIdMatched: true,
    ...publicFields,
    appendLocalizedScreenshots: plan.appendLocalizedScreenshots.map(path => basename(path)),
    appendGlobalScreenshots: plan.appendGlobalScreenshots.map(path => basename(path)),
    uploadIcon: plan.uploadIcon ? basename(plan.uploadIcon) : null,
    uploadSmallPromo: plan.uploadSmallPromo ? basename(plan.uploadSmallPromo) : null,
    uploadMarqueePromo: plan.uploadMarqueePromo ? basename(plan.uploadMarqueePromo) : null,
  };
}
