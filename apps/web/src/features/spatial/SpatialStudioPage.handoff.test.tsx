// @vitest-environment jsdom

import type { AssetInputCandidate } from '@platform/types';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PlatformDataSnapshot } from '@/lib/api';
import { AuthContext, type AuthContextValue } from '@/auth/auth-context';
import {
  createHandoffPath,
  createSpatialAssetHandoff,
} from '@/features/asset-flow/handoff';
import { I18nProvider } from '@/i18n/I18nProvider';
import { platformMock } from '@/mocks/platform';

import { SpatialStudioPage } from './SpatialStudioPage';

const hoisted = vi.hoisted(() => ({
  loadAssetInputCandidatesMock: vi.fn<(...args: unknown[]) => Promise<AssetInputCandidate[]>>(),
  listSpatialRoisMock: vi.fn(async () => []),
  listSpatialOverlaysMock: vi.fn(async () => []),
}));

vi.mock('@/features/asset-flow/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/asset-flow/api')>(
    '@/features/asset-flow/api',
  );
  return {
    ...actual,
    loadAssetInputCandidates: hoisted.loadAssetInputCandidatesMock,
  };
});

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    listSpatialRois: hoisted.listSpatialRoisMock,
    listSpatialOverlays: hoisted.listSpatialOverlaysMock,
  };
});

vi.mock('@/components/SpatialMapCanvas', () => ({
  SpatialMapCanvas: ({
    overlays,
    selectedOverlayIds,
  }: {
    overlays: Array<{ datasetVersionId: string; id: string }>;
    selectedOverlayIds: string[];
  }) => (
    <div data-testid="spatial-map-probe">
      {JSON.stringify({
        overlayDatasetVersionIds: overlays.map((item) => item.datasetVersionId),
        selectedOverlayIds,
      })}
    </div>
  ),
}));

function SearchProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

const authUser: AuthContextValue['currentUser'] = {
  id: 'user-member',
  email: 'member@platform.local',
  displayName: 'Team Member',
  role: 'MEMBER',
  approvalStatus: 'APPROVED',
  preferredLocale: 'en-US',
  permissions: ['workspace.view', 'dataset.view', 'workflow.view'],
};

const authValue: AuthContextValue = {
  status: 'authenticated',
  token: 'token-test',
  currentUser: authUser,
  login: async () => authUser!,
  register: async () => undefined,
  logout: async () => undefined,
  refreshCurrentUser: async () => authUser,
  hasPermission: (permission) => authUser?.permissions.includes(permission) ?? false,
};

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  Object.defineProperty(window, 'getComputedStyle', {
    writable: true,
    value: (element: Element) => nativeGetComputedStyle(element),
  });

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  hoisted.loadAssetInputCandidatesMock.mockReset();
  hoisted.listSpatialRoisMock.mockClear();
  hoisted.listSpatialOverlaysMock.mockClear();
  window.localStorage.clear();
});

describe('SpatialStudioPage handoff', () => {
  it('waits for overlay candidates before consuming a map handoff', async () => {
    let resolveCandidates: ((value: AssetInputCandidate[]) => void) | undefined;
    hoisted.loadAssetInputCandidatesMock.mockImplementation(
      () =>
        new Promise<AssetInputCandidate[]>((resolve) => {
          resolveCandidates = resolve;
        }),
    );

    const snapshot: PlatformDataSnapshot = {
      ...platformMock,
      source: 'mock',
    };
    const initialPath = createHandoffPath(
      '/spatial',
      createSpatialAssetHandoff('dsv-tabular-prediction-v1', {
        source: 'workflow_run_history',
      }),
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <AuthContext.Provider value={authValue}>
            <I18nProvider>
              <MemoryRouter initialEntries={[initialPath]}>
                <Routes>
                  <Route
                    path="/spatial"
                    element={
                      <>
                        <SpatialStudioPage snapshot={snapshot} onRefresh={async () => undefined} />
                        <SearchProbe />
                      </>
                    }
                  />
                </Routes>
              </MemoryRouter>
            </I18nProvider>
          </AuthContext.Provider>,
        );
      });

      await flushEffects();
      expect(container.querySelector('[data-testid="location-search"]')?.textContent).toContain(
        'handoff=',
      );

      await act(async () => {
        resolveCandidates?.([
          {
            id: 'asset-version:dsv-tabular-prediction-v1:map_overlay',
            consumer: 'map_overlay',
            candidateType: 'asset_version',
            title: 'Prediction Output v1',
            description: 'Workflow output ready for map preview.',
            assetVersion: {
              id: 'dsv-tabular-prediction-v1',
              asset: {
                id: 'dataset-tabular-prediction',
                assetType: 'dataset',
                assetKind: 'vector',
                workspaceId: snapshot.workspace.id,
                name: 'Prediction Output',
                visibility: 'private',
                ownerUserId: authUser?.id,
                ownerDisplayName: authUser?.displayName,
              },
              versionLabel: 'v1',
              versionNumber: 1,
              createdAt: '2026-04-11T00:00:00Z',
              upstreamAssetVersionIds: [],
              format: 'geojson',
              capabilities: ['downloadable', 'map_overlay_ready'],
              consumableBy: ['map_overlay'],
              spatialTraits: {
                overlayType: 'vector',
                bbox: [100, 20, 101, 21],
                previewUrl: '/preview.geojson',
              },
            },
          },
        ]);
      });

      await flushEffects();
      await flushEffects();

      const probe = container.querySelector('[data-testid="spatial-map-probe"]')?.textContent ?? '';
      expect(probe).toContain('dsv-tabular-prediction-v1');
      expect(container.querySelector('[data-testid="location-search"]')?.textContent).toBe('');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
