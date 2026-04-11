import type { PlatformDataSnapshot } from '@/lib/api';

import { PersonalAssetsPage } from './PersonalAssetsPage';

export function MyAssetsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  return <PersonalAssetsPage snapshot={snapshot} onRefresh={onRefresh} view="assets" />;
}
