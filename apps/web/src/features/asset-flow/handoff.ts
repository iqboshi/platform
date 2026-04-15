import type { AssetHandoffPayload, AssetHandoffSource } from '@platform/types';

const HANDOFF_QUERY_KEY = 'handoff';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalTargetNodeId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function createWorkflowDatasetHandoff(
  datasetVersionId: string,
  options: { label?: string; source?: AssetHandoffSource; targetNodeId?: string } = {},
): AssetHandoffPayload {
  return {
    version: 1,
    target: 'workflow',
    inputKind: 'dataset_version',
    datasetVersionId,
    targetNodeId: optionalTargetNodeId(options.targetNodeId),
    label: options.label,
    source: options.source ?? 'unknown',
  };
}

export function createWorkflowRoiHandoff(
  roiId: string,
  options: { label?: string; source?: AssetHandoffSource; targetNodeId?: string } = {},
): AssetHandoffPayload {
  return {
    version: 1,
    target: 'workflow',
    inputKind: 'spatial_roi',
    roiId,
    targetNodeId: optionalTargetNodeId(options.targetNodeId),
    label: options.label,
    source: options.source ?? 'unknown',
  };
}

export function createWorkflowModelHandoff(
  modelVersionId: string,
  options: { label?: string; source?: AssetHandoffSource; targetNodeId?: string } = {},
): AssetHandoffPayload {
  return {
    version: 1,
    target: 'workflow',
    inputKind: 'model_version',
    modelVersionId,
    targetNodeId: optionalTargetNodeId(options.targetNodeId),
    label: options.label,
    source: options.source ?? 'unknown',
  };
}

export function createWorkflowGeeCredentialHandoff(
  geeCredentialId: string,
  options: { label?: string; source?: AssetHandoffSource; targetNodeId?: string } = {},
): AssetHandoffPayload {
  return {
    version: 1,
    target: 'workflow',
    inputKind: 'gee_credential',
    geeCredentialId,
    targetNodeId: optionalTargetNodeId(options.targetNodeId),
    label: options.label,
    source: options.source ?? 'unknown',
  };
}

export function createSpatialAssetHandoff(
  assetVersionId: string,
  options: { label?: string; source?: AssetHandoffSource } = {},
): AssetHandoffPayload {
  return {
    version: 1,
    target: 'spatial',
    inputKind: 'asset_version',
    assetVersionId,
    label: options.label,
    source: options.source ?? 'unknown',
  };
}

export function encodeAssetHandoff(payload: AssetHandoffPayload): string {
  return JSON.stringify(payload);
}

export function decodeAssetHandoff(rawValue: string | null | undefined): AssetHandoffPayload | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) {
      return null;
    }
    const normalizedParsed = {
      ...parsed,
      targetNodeId: optionalTargetNodeId(parsed.targetNodeId),
    };

    if (parsed.target === 'workflow' && parsed.inputKind === 'dataset_version') {
      return typeof parsed.datasetVersionId === 'string' && parsed.datasetVersionId
        ? (normalizedParsed as AssetHandoffPayload)
        : null;
    }

    if (parsed.target === 'workflow' && parsed.inputKind === 'spatial_roi') {
      return typeof parsed.roiId === 'string' && parsed.roiId
        ? (normalizedParsed as AssetHandoffPayload)
        : null;
    }

    if (parsed.target === 'workflow' && parsed.inputKind === 'model_version') {
      return typeof parsed.modelVersionId === 'string' && parsed.modelVersionId
        ? (normalizedParsed as AssetHandoffPayload)
        : null;
    }

    if (parsed.target === 'workflow' && parsed.inputKind === 'gee_credential') {
      return typeof parsed.geeCredentialId === 'string' && parsed.geeCredentialId
        ? (normalizedParsed as AssetHandoffPayload)
        : null;
    }

    if (parsed.target === 'spatial' && parsed.inputKind === 'asset_version') {
      return typeof parsed.assetVersionId === 'string' && parsed.assetVersionId
        ? (normalizedParsed as AssetHandoffPayload)
        : null;
    }

    return null;
  } catch {
    return null;
  }
}

export function createHandoffPath(pathname: string, payload: AssetHandoffPayload): string {
  const search = new URLSearchParams({
    [HANDOFF_QUERY_KEY]: encodeAssetHandoff(payload),
  });
  return `${pathname}?${search.toString()}`;
}

export function readHandoffFromSearchParams(searchParams: URLSearchParams): AssetHandoffPayload | null {
  return decodeAssetHandoff(searchParams.get(HANDOFF_QUERY_KEY));
}

export function removeHandoffFromSearchParams(searchParams: URLSearchParams): URLSearchParams {
  const nextSearch = new URLSearchParams(searchParams);
  nextSearch.delete(HANDOFF_QUERY_KEY);
  return nextSearch;
}
