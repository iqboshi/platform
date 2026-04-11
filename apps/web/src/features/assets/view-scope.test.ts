import { describe, expect, it } from 'vitest';

import {
  getInitialAssetScopeForView,
  shouldInitializeAdminAssetScope,
} from './view-scope';

describe('asset view scope helpers', () => {
  it('defaults admin asset views to all scope', () => {
    expect(shouldInitializeAdminAssetScope('assets')).toBe(true);
    expect(shouldInitializeAdminAssetScope('account')).toBe(true);
    expect(getInitialAssetScopeForView('assets', 'ADMIN')).toBe('all');
    expect(getInitialAssetScopeForView('account', 'ADMIN')).toBe('all');
  });

  it('keeps workspace settings out of asset scope loading', () => {
    expect(shouldInitializeAdminAssetScope('workspace-settings')).toBe(false);
    expect(getInitialAssetScopeForView('workspace-settings', 'ADMIN')).toBe('mine');
  });

  it('keeps non-admin users on their own assets', () => {
    expect(getInitialAssetScopeForView('assets', 'MEMBER')).toBe('mine');
    expect(getInitialAssetScopeForView('account', undefined)).toBe('mine');
  });
});
