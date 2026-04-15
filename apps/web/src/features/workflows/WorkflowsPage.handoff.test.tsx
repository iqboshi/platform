// @vitest-environment jsdom

import type { WorkflowVersionDetail } from '@platform/types';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PlatformDataSnapshot } from '@/lib/api';
import { AuthContext, type AuthContextValue } from '@/auth/auth-context';
import {
  createHandoffPath,
  createWorkflowDatasetHandoff,
  createWorkflowGeeCredentialHandoff,
  createWorkflowModelHandoff,
} from '@/features/asset-flow/handoff';
import { I18nProvider } from '@/i18n/I18nProvider';
import { platformMock } from '@/mocks/platform';

import { WorkflowsPage } from './WorkflowsPage';

const { listSpatialRoisMock, renderedWorkflowVersions } = vi.hoisted(() => ({
  listSpatialRoisMock: vi.fn(async () => []),
  renderedWorkflowVersions: [] as WorkflowVersionDetail[],
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    listSpatialRois: listSpatialRoisMock,
  };
});

vi.mock('@/components/WorkflowCanvas', () => ({
  WorkflowCanvas: ({ workflowVersion }: { workflowVersion: WorkflowVersionDetail }) => {
    renderedWorkflowVersions.push(workflowVersion);
    return <div data-testid="workflow-canvas">{JSON.stringify(workflowVersion.graph.nodes)}</div>;
  },
}));

vi.mock('@/features/asset-flow/AssetFlowPanel', () => ({
  AssetFlowPanel: () => null,
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
  permissions: ['workflow.view', 'workflow.manage', 'workflow.run', 'dataset.view'],
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

async function renderWorkflowsRoute(snapshot: PlatformDataSnapshot, initialPath: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <AuthContext.Provider value={authValue}>
        <I18nProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route
                path="/workflows"
                element={
                  <>
                    <WorkflowsPage snapshot={snapshot} onRefresh={async () => undefined} />
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
  await flushEffects();

  return {
    container,
    root,
  };
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
  listSpatialRoisMock.mockClear();
  renderedWorkflowVersions.length = 0;
  window.localStorage.clear();
});

describe('WorkflowsPage handoff', () => {
  it('consumes a workflow dataset handoff once and clears the search params', async () => {
    const snapshot: PlatformDataSnapshot = {
      ...platformMock,
      source: 'mock',
      workflowVersion: {
        ...platformMock.workflowVersion,
        graph: {
          nodes: [],
          edges: [],
        },
      },
    };
    const initialPath = createHandoffPath(
      '/workflows',
      createWorkflowDatasetHandoff('dsv-tabular-input-v1', {
        source: 'my_assets',
      }),
    );
    const { container, root } = await renderWorkflowsRoute(snapshot, initialPath);

    try {
      const latestWorkflow = renderedWorkflowVersions.at(-1);
      const datasetNode = latestWorkflow?.graph.nodes.find(
        (node) => node.type === 'source.dataset_version',
      );

      expect(datasetNode?.params.datasetVersionId).toBe('dsv-tabular-input-v1');
      expect(container.querySelector('[data-testid="location-search"]')?.textContent).toBe('');
      expect(renderedWorkflowVersions.length).toBeLessThan(10);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('refuses an ambiguous dataset handoff when multiple dataset starters already exist', async () => {
    const datasetOutputs =
      platformMock.workflowCatalog.find((node) => node.type === 'source.dataset_version')?.outputs ?? [];
    const snapshot: PlatformDataSnapshot = {
      ...platformMock,
      source: 'mock',
      workflowVersion: {
        ...platformMock.workflowVersion,
        graph: {
          nodes: [
            {
              id: 'dataset-source-a',
              type: 'source.dataset_version',
              position: { x: 120, y: 140 },
              params: { datasetVersionId: 'dsv-rgb-geo-raster-v1' },
              inputBindings: {},
              outputDefs: datasetOutputs,
            },
            {
              id: 'dataset-source-b',
              type: 'source.dataset_version',
              position: { x: 120, y: 320 },
              params: { datasetVersionId: 'dsv-tabular-input-v1' },
              inputBindings: {},
              outputDefs: datasetOutputs,
            },
          ],
          edges: [],
        },
      },
    };
    const initialPath = createHandoffPath(
      '/workflows',
      createWorkflowDatasetHandoff('dsv-rgb-vector-labels-v1', {
        source: 'my_assets',
      }),
    );
    const { container, root } = await renderWorkflowsRoute(snapshot, initialPath);

    try {
      const latestWorkflow = renderedWorkflowVersions.at(-1);
      const datasetNodes = latestWorkflow?.graph.nodes.filter(
        (node) => node.type === 'source.dataset_version',
      );

      expect(datasetNodes).toHaveLength(2);
      expect(datasetNodes?.[0]?.params.datasetVersionId).toBe('dsv-rgb-geo-raster-v1');
      expect(datasetNodes?.[1]?.params.datasetVersionId).toBe('dsv-tabular-input-v1');
      expect(container.textContent).toContain('multiple compatible dataset starters');
      expect(container.querySelector('[data-testid="location-search"]')?.textContent).toBe('');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('offers a target chooser modal for ambiguous dataset handoffs and applies the selected node', async () => {
    const datasetOutputs =
      platformMock.workflowCatalog.find((node) => node.type === 'source.dataset_version')?.outputs ?? [];
    const snapshot: PlatformDataSnapshot = {
      ...platformMock,
      source: 'mock',
      workflowVersion: {
        ...platformMock.workflowVersion,
        graph: {
          nodes: [
            {
              id: 'dataset-source-a',
              type: 'source.dataset_version',
              position: { x: 120, y: 140 },
              params: { datasetVersionId: 'dsv-rgb-geo-raster-v1' },
              inputBindings: {},
              outputDefs: datasetOutputs,
            },
            {
              id: 'dataset-source-b',
              type: 'source.dataset_version',
              position: { x: 120, y: 320 },
              params: { datasetVersionId: 'dsv-tabular-input-v1' },
              inputBindings: {},
              outputDefs: datasetOutputs,
            },
          ],
          edges: [],
        },
      },
    };
    const initialPath = createHandoffPath(
      '/workflows',
      createWorkflowDatasetHandoff('dsv-rgb-vector-labels-v1', {
        source: 'my_assets',
      }),
    );
    const { container, root } = await renderWorkflowsRoute(snapshot, initialPath);

    try {
      const chooseButton = document.querySelector(
        '[data-testid="starter-target-dataset-source-b"]',
      ) as HTMLButtonElement | null;

      expect(chooseButton).not.toBeNull();
      await act(async () => {
        chooseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flushEffects();

      const latestWorkflow = renderedWorkflowVersions.at(-1);
      const datasetNodes = latestWorkflow?.graph.nodes.filter(
        (node) => node.type === 'source.dataset_version',
      );

      expect(datasetNodes?.[0]?.params.datasetVersionId).toBe('dsv-rgb-geo-raster-v1');
      expect(datasetNodes?.[1]?.params.datasetVersionId).toBe('dsv-rgb-vector-labels-v1');
      expect(container.textContent).toContain('bound to the selected starter node');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('binds a dataset handoff to the explicit target node id when provided', async () => {
    const datasetOutputs =
      platformMock.workflowCatalog.find((node) => node.type === 'source.dataset_version')?.outputs ?? [];
    const snapshot: PlatformDataSnapshot = {
      ...platformMock,
      source: 'mock',
      workflowVersion: {
        ...platformMock.workflowVersion,
        graph: {
          nodes: [
            {
              id: 'dataset-source-a',
              type: 'source.dataset_version',
              position: { x: 120, y: 140 },
              params: { datasetVersionId: 'dsv-rgb-geo-raster-v1' },
              inputBindings: {},
              outputDefs: datasetOutputs,
            },
            {
              id: 'dataset-source-b',
              type: 'source.dataset_version',
              position: { x: 120, y: 320 },
              params: { datasetVersionId: 'dsv-tabular-input-v1' },
              inputBindings: {},
              outputDefs: datasetOutputs,
            },
          ],
          edges: [],
        },
      },
    };
    const initialPath = createHandoffPath(
      '/workflows',
      createWorkflowDatasetHandoff('dsv-rgb-vector-labels-v1', {
        source: 'my_assets',
        targetNodeId: 'dataset-source-b',
      }),
    );
    const { container, root } = await renderWorkflowsRoute(snapshot, initialPath);

    try {
      const latestWorkflow = renderedWorkflowVersions.at(-1);
      const datasetNodes = latestWorkflow?.graph.nodes.filter(
        (node) => node.type === 'source.dataset_version',
      );

      expect(datasetNodes).toHaveLength(2);
      expect(datasetNodes?.[0]?.params.datasetVersionId).toBe('dsv-rgb-geo-raster-v1');
      expect(datasetNodes?.[1]?.params.datasetVersionId).toBe('dsv-rgb-vector-labels-v1');
      expect(container.querySelector('[data-testid="location-search"]')?.textContent).toBe('');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('auto-creates a model starter node for workflow model handoffs', async () => {
    const snapshot: PlatformDataSnapshot = {
      ...platformMock,
      source: 'mock',
      workflowVersion: {
        ...platformMock.workflowVersion,
        graph: {
          nodes: [],
          edges: [],
        },
      },
    };
    const initialPath = createHandoffPath(
      '/workflows',
      createWorkflowModelHandoff('modelv-linear-v1', {
        source: 'my_assets',
      }),
    );
    const { container, root } = await renderWorkflowsRoute(snapshot, initialPath);

    try {
      const latestWorkflow = renderedWorkflowVersions.at(-1);
      const modelNode = latestWorkflow?.graph.nodes.find((node) => node.type === 'source.model_version');

      expect(modelNode?.params.modelVersionId).toBe('modelv-linear-v1');
      expect(container.querySelector('[data-testid="location-search"]')?.textContent).toBe('');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('reuses an existing Sentinel starter node for workflow gee handoffs', async () => {
    const sentinelOutputs =
      platformMock.workflowCatalog.find((node) => node.type === 'source.sentinel2_gee_download')?.outputs ?? [];
    const snapshot: PlatformDataSnapshot = {
      ...platformMock,
      source: 'mock',
      geeCredentials: [
        {
          id: 'gee-personal-1',
          workspaceId: platformMock.workspace.id,
          ownerUserId: authUser.id,
          ownerDisplayName: authUser.displayName,
          name: 'Personal GEE',
          provider: 'google_earth_engine',
          projectId: 'gee-project-1',
          serviceAccountEmail: 'gee@platform.local',
          createdAt: '2026-04-12T00:00:00Z',
        },
      ],
      workflowVersion: {
        ...platformMock.workflowVersion,
        graph: {
          nodes: [
            {
              id: 'sentinel-source',
              type: 'source.sentinel2_gee_download',
              position: { x: 120, y: 160 },
              params: {
                roiMode: 'bbox',
                credentialMode: 'platform_default',
              },
              inputBindings: {},
              outputDefs: sentinelOutputs,
            },
          ],
          edges: [],
        },
      },
    };
    const initialPath = createHandoffPath(
      '/workflows',
      createWorkflowGeeCredentialHandoff('gee-personal-1', {
        source: 'my_assets',
      }),
    );
    const { container, root } = await renderWorkflowsRoute(snapshot, initialPath);

    try {
      const latestWorkflow = renderedWorkflowVersions.at(-1);
      const sentinelNode = latestWorkflow?.graph.nodes.find(
        (node) => node.type === 'source.sentinel2_gee_download',
      );

      expect(sentinelNode?.params.credentialMode).toBe('personal');
      expect(sentinelNode?.params.personalCredentialId).toBe('gee-personal-1');
      expect(container.querySelector('[data-testid="location-search"]')?.textContent).toBe('');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('disables running when the current workflow graph has semantic errors', async () => {
    const datasetOutputs =
      platformMock.workflowCatalog.find((node) => node.type === 'source.dataset_version')?.outputs ?? [];
    const snapshot: PlatformDataSnapshot = {
      ...platformMock,
      source: 'mock',
      workflowVersion: {
        ...platformMock.workflowVersion,
        graph: {
          nodes: [
            {
              id: 'broken-dataset-source',
              type: 'source.dataset_version',
              position: { x: 120, y: 160 },
              params: { datasetVersionId: '' },
              inputBindings: {},
              outputDefs: datasetOutputs,
            },
          ],
          edges: [],
        },
      },
    };
    const { container, root } = await renderWorkflowsRoute(snapshot, '/workflows');

    try {
      const actionButtons = Array.from(
        container.querySelectorAll('.workflow-action-bar button'),
      ) as HTMLButtonElement[];
      const runButton = actionButtons.at(-1);

      expect(runButton).toBeDefined();
      expect(runButton?.disabled).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
