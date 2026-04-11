import type { PlatformDataSnapshot } from '@/lib/api';

import { PersonalAssetsPage } from '@/features/assets/PersonalAssetsPage';

export function AccountCenterPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  return <PersonalAssetsPage snapshot={snapshot} onRefresh={onRefresh} view="account" />;
}
