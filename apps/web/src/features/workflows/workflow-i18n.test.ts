import { describe, expect, it } from 'vitest';

import { platformMock } from '@/mocks/platform';

import {
  localizeWorkflowCatalog,
  localizeWorkflowIssue,
  localizeWorkflowTemplates,
  localizeWorkflowText,
} from './workflow-i18n';

function containsNonAscii(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) > 127);
}

describe('workflow-i18n', () => {
  it('localizes workflow node labels and parameter labels for zh-CN', () => {
    const datasetNode = platformMock.workflowCatalog.find((item) => item.type === 'source.dataset_version');
    expect(datasetNode).toBeDefined();

    const [localizedNode] = localizeWorkflowCatalog('zh-CN', [datasetNode!]);

    expect(localizedNode.label).not.toBe('Dataset Version');
    expect(containsNonAscii(localizedNode.label)).toBe(true);
    expect(localizedNode.params[0]).toBeDefined();
    expect(containsNonAscii(localizedNode.params[0].label)).toBe(true);
  });

  it('preserves machine-readable contract tokens when localizing the catalog', () => {
    const loadCsvNode = platformMock.workflowCatalog.find((item) => item.type === 'table.load_csv');
    expect(loadCsvNode).toBeDefined();

    const [localizedNode] = localizeWorkflowCatalog('zh-CN', [loadCsvNode!]);
    const contract = localizedNode.inputContracts?.[0];

    expect(contract).toBeDefined();
    expect(contract?.datasetKinds).toEqual(['table']);
    expect(contract?.fileFormats).toEqual(['csv']);
    expect(contract?.sampleColumns).toEqual(['feature_a', 'feature_b', 'target']);
  });

  it('localizes workflow template labels for zh-CN', () => {
    const imageTemplate = platformMock.workflowTemplates.find(
      (template) => template.id === 'sample.image_collection_tiles',
    );
    expect(imageTemplate).toBeDefined();

    const [localizedTemplate] = localizeWorkflowTemplates('zh-CN', [
      imageTemplate!,
    ]);

    expect(localizedTemplate.label).not.toBe(imageTemplate!.label);
    expect(containsNonAscii(localizedTemplate.label)).toBe(true);
  });

  it('localizes dynamic workflow contract summaries for zh-CN', () => {
    const localized = localizeWorkflowText(
      'zh-CN',
      'Prediction table containing the configured prediction column.',
    );

    expect(localized).toBe('包含已配置预测列的预测表。');
  });

  it('localizes dynamic workflow validation issues for zh-CN', () => {
    const localized = localizeWorkflowIssue('zh-CN', {
      code: 'invalid_input',
      severity: 'error',
      message: 'Prediction Table is required.',
      suggestion:
        'Choose a compatible dataset version or reconnect this input to a compatible upstream node.',
    });

    expect(localized.message).toBe('预测表为必填项。');
    expect(localized.suggestion).toBe(
      '请选择兼容的数据集版本，或将该输入重新连接到兼容的上游节点。',
    );
  });
});
