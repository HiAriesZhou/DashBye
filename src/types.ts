export type AssetConfig = {
  icon?: string;
  localizedScreenshots: string[];
  globalScreenshots: string[];
  smallPromo?: string;
  marqueePromo?: string;
};

export type StoreConfig = {
  schema: 'cws-release-kit/v1';
  language: string;
  description: string;
  assets: AssetConfig;
};

export type ResolvedStoreConfig = Omit<StoreConfig, 'description' | 'assets'> & {
  configPath: string;
  descriptionPath: string;
  descriptionText: string;
  assets: AssetConfig;
  assetHashes: Record<string, string>;
};

export type DashboardSnapshot = {
  itemId: string;
  language: string;
  descriptionLength: number;
  descriptionSha256: string;
  localizedScreenshotCount: number;
  globalScreenshotCount: number;
  hasIcon: boolean;
  hasSmallPromo: boolean;
  hasMarqueePromo: boolean;
  saveDraftEnabled: boolean;
};

export type PublicDashboardSnapshot = Omit<DashboardSnapshot, 'itemId'> & {
  itemIdMatched: true;
};

export type DraftPlan = {
  itemId: string;
  language: string;
  description: 'unchanged' | 'update';
  appendLocalizedScreenshots: string[];
  appendGlobalScreenshots: string[];
  uploadIcon: string | null;
  uploadSmallPromo: string | null;
  uploadMarqueePromo: string | null;
  requiresExistingPrefixConfirmation: boolean;
};
