import type { AssetScope } from '@platform/types';

export type PersonalAssetsPageView = 'assets' | 'account' | 'workspace-settings';

export function shouldInitializeAdminAssetScope(view: PersonalAssetsPageView): boolean {
  return view === 'assets' || view === 'account';
}

export function getInitialAssetScopeForView(
  view: PersonalAssetsPageView,
  role: string | undefined,
): AssetScope {
  return role === 'ADMIN' && shouldInitializeAdminAssetScope(view) ? 'all' : 'mine';
}
