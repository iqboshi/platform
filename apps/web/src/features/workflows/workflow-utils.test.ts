import { describe, expect, it } from 'vitest';

import { platformMock } from '@/mocks/platform';

import { buildWorkflowStats } from './workflow-utils';

describe('buildWorkflowStats', () => {
  it('counts nodes, edges, and categories in the demo workflow', () => {
    const stats = buildWorkflowStats(platformMock.workflowCatalog, platformMock.workflowVersion);

    expect(stats).toEqual({
      nodeCount: 11,
      edgeCount: 13,
      categoryCount: 4,
    });
  });
});
