import { describe, expect, it } from 'vitest';

import {
  createSpatialAssetHandoff,
  createWorkflowDatasetHandoff,
  createWorkflowGeeCredentialHandoff,
  createWorkflowModelHandoff,
  createWorkflowRoiHandoff,
  createHandoffPath,
  decodeAssetHandoff,
  readHandoffFromSearchParams,
  removeHandoffFromSearchParams,
} from './handoff';

describe('asset handoff helpers', () => {
  it('encodes and decodes workflow dataset payloads', () => {
    const payload = createWorkflowDatasetHandoff('dataset-version-1', {
      label: 'Sentinel Output',
      source: 'my_assets',
    });

    const path = createHandoffPath('/workflows', payload);
    const searchParams = new URL(path, 'http://localhost').searchParams;

    expect(readHandoffFromSearchParams(searchParams)).toEqual(payload);
  });

  it('removes handoff payloads after consumption', () => {
    const payload = createSpatialAssetHandoff('asset-version-1', {
      source: 'asset_flow',
    });
    const path = createHandoffPath('/spatial', payload);
    const searchParams = new URL(path, 'http://localhost').searchParams;

    expect(searchParams.get('handoff')).toBeTruthy();
    expect(removeHandoffFromSearchParams(searchParams).get('handoff')).toBeNull();
  });

  it('rejects malformed payloads', () => {
    expect(decodeAssetHandoff('{"version":1,"target":"workflow","inputKind":"dataset_version"}')).toBeNull();
    expect(decodeAssetHandoff('not-json')).toBeNull();
  });

  it('supports roi payloads', () => {
    const payload = createWorkflowRoiHandoff('roi-1', {
      source: 'spatial_roi',
    });

    expect(decodeAssetHandoff(JSON.stringify(payload))).toEqual(payload);
  });

  it('supports model version payloads', () => {
    const payload = createWorkflowModelHandoff('model-version-1', {
      source: 'my_assets',
    });

    expect(decodeAssetHandoff(JSON.stringify(payload))).toEqual(payload);
  });

  it('supports gee credential payloads', () => {
    const payload = createWorkflowGeeCredentialHandoff('gee-credential-1', {
      source: 'my_assets',
    });

    expect(decodeAssetHandoff(JSON.stringify(payload))).toEqual(payload);
  });
});
