import type {
  AssetConsumer,
  AssetInputCandidate,
  AssetFlowOverview,
  AssetRef,
  AssetScope,
  AssetVersionRef,
  ExecutionSummary,
  LineageEdge,
} from '@platform/types';

import { apiBaseUrl, isPortfolioDemo } from '@/config/env';
import { clonePlatformMock, platformMock } from '@/mocks/platform';

type ApiRecord = Record<string, unknown>;

function getString(input: ApiRecord, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

function getOptionalString(input: ApiRecord, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value ? value : undefined;
}

function getRecord(input: ApiRecord, key: string): ApiRecord {
  const value = input[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ApiRecord)
    : {};
}

function getStringArray(input: ApiRecord, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function getBBox(input: ApiRecord, key: string): [number, number, number, number] | undefined {
  const value = input[key];
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  return value.every((item) => typeof item === 'number')
    ? (value as [number, number, number, number])
    : undefined;
}

function withQuery(path: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}

async function requestJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${path}`);
  }

  return (await response.json()) as T;
}

function normalizeAssetRef(input: ApiRecord): AssetRef {
  return {
    id: getString(input, 'id'),
    assetType: (getString(input, 'assetType') || getString(input, 'asset_type')) as AssetRef['assetType'],
    assetKind: getString(input, 'assetKind') || getString(input, 'asset_kind'),
    workspaceId: getString(input, 'workspaceId') || getString(input, 'workspace_id'),
    name: getString(input, 'name'),
    visibility: (getString(input, 'visibility') || 'private') as AssetRef['visibility'],
    ownerUserId: getOptionalString(input, 'ownerUserId') ?? getOptionalString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ?? getOptionalString(input, 'owner_display_name'),
  };
}

function normalizeAssetVersionRef(input: ApiRecord): AssetVersionRef {
  const spatialTraits = getRecord(input, 'spatialTraits');
  const rawSpatialTraits =
    Object.keys(spatialTraits).length > 0 ? spatialTraits : getRecord(input, 'spatial_traits');

  return {
    id: getString(input, 'id'),
    asset: normalizeAssetRef(getRecord(input, 'asset')),
    versionLabel: getString(input, 'versionLabel') || getString(input, 'version_label'),
    versionNumber:
      Number(input.versionNumber ?? input.version_number) || undefined,
    status: getOptionalString(input, 'status'),
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
    sourceExecutionId:
      getOptionalString(input, 'sourceExecutionId') ??
      getOptionalString(input, 'source_execution_id'),
    upstreamAssetVersionIds:
      getStringArray(input, 'upstreamAssetVersionIds').length > 0
        ? getStringArray(input, 'upstreamAssetVersionIds')
        : getStringArray(input, 'upstream_asset_version_ids'),
    format: (getString(input, 'format') || 'unknown') as AssetVersionRef['format'],
    capabilities: (
      getStringArray(input, 'capabilities').length > 0
        ? getStringArray(input, 'capabilities')
        : []
    ) as AssetVersionRef['capabilities'],
    consumableBy: (
      getStringArray(input, 'consumableBy').length > 0
        ? getStringArray(input, 'consumableBy')
        : getStringArray(input, 'consumable_by')
    ) as AssetVersionRef['consumableBy'],
    spatialTraits:
      Object.keys(rawSpatialTraits).length > 0
        ? {
            overlayType:
              (getOptionalString(rawSpatialTraits, 'overlayType') ??
                getOptionalString(rawSpatialTraits, 'overlay_type')) as
                | 'raster'
                | 'vector'
                | undefined,
            bbox:
              getBBox(rawSpatialTraits, 'bbox') ??
              undefined,
            previewUrl:
              getOptionalString(rawSpatialTraits, 'previewUrl') ??
              getOptionalString(rawSpatialTraits, 'preview_url'),
          }
        : undefined,
  };
}

function normalizeExecutionSummary(input: ApiRecord): ExecutionSummary {
  return {
    id: getString(input, 'id'),
    executionType:
      (getString(input, 'executionType') || getString(input, 'execution_type')) as ExecutionSummary['executionType'],
    status: getString(input, 'status') as ExecutionSummary['status'],
    submittedBy: getString(input, 'submittedBy') || getString(input, 'submitted_by'),
    workflowVersionId:
      getString(input, 'workflowVersionId') || getString(input, 'workflow_version_id'),
    workflowName:
      getOptionalString(input, 'workflowName') ?? getOptionalString(input, 'workflow_name'),
    inputAssetVersionIds:
      getStringArray(input, 'inputAssetVersionIds').length > 0
        ? getStringArray(input, 'inputAssetVersionIds')
        : getStringArray(input, 'input_asset_version_ids'),
    outputAssetVersionIds:
      getStringArray(input, 'outputAssetVersionIds').length > 0
        ? getStringArray(input, 'outputAssetVersionIds')
        : getStringArray(input, 'output_asset_version_ids'),
    primaryOutputAssetVersionId:
      getOptionalString(input, 'primaryOutputAssetVersionId') ??
      getOptionalString(input, 'primary_output_asset_version_id'),
    metrics: getRecord(input, 'metrics'),
    errorMessage: getOptionalString(input, 'errorMessage') ?? getOptionalString(input, 'error_message'),
    startedAt: getOptionalString(input, 'startedAt') ?? getOptionalString(input, 'started_at'),
    finishedAt: getOptionalString(input, 'finishedAt') ?? getOptionalString(input, 'finished_at'),
  };
}

function normalizeLineageEdge(input: ApiRecord): LineageEdge {
  return {
    id: getString(input, 'id'),
    relationship: (getString(input, 'relationship') || 'execution_output') as LineageEdge['relationship'],
    sourceAssetVersionId:
      getString(input, 'sourceAssetVersionId') || getString(input, 'source_asset_version_id'),
    targetAssetVersionId:
      getString(input, 'targetAssetVersionId') || getString(input, 'target_asset_version_id'),
    executionId: getOptionalString(input, 'executionId') ?? getOptionalString(input, 'execution_id'),
  };
}

function normalizeSpatialRoi(input: ApiRecord): AssetInputCandidate['spatialRoi'] {
  const bbox = getBBox(input, 'bbox') ?? [0, 0, 0, 0];
  return {
    id: getString(input, 'id'),
    workspaceId: getString(input, 'workspaceId') || getString(input, 'workspace_id'),
    ownerUserId: getString(input, 'ownerUserId') || getString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ?? getOptionalString(input, 'owner_display_name'),
    name: getString(input, 'name'),
    description: getOptionalString(input, 'description'),
    geometryType:
      (getString(input, 'geometryType') || getString(input, 'geometry_type')) as
        | 'rectangle'
        | 'polygon',
    geometry: getRecord(input, 'geometry'),
    bbox,
    style: getRecord(input, 'style'),
    tags:
      getStringArray(input, 'tags').length > 0
        ? getStringArray(input, 'tags')
        : [],
    visibility: (getOptionalString(input, 'visibility') ?? 'private') as 'private' | 'public',
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
    updatedAt: getString(input, 'updatedAt') || getString(input, 'updated_at'),
  };
}

function normalizeModelVersion(input: ApiRecord): AssetInputCandidate['modelVersion'] {
  return {
    id: getString(input, 'id'),
    modelId: getString(input, 'modelId') || getString(input, 'model_id'),
    modelName: getOptionalString(input, 'modelName') ?? getOptionalString(input, 'model_name'),
    algorithmKey:
      getOptionalString(input, 'algorithmKey') ?? getOptionalString(input, 'algorithm_key'),
    version: getString(input, 'version'),
    framework: getString(input, 'framework'),
    taskType: getString(input, 'taskType') || getString(input, 'task_type'),
    featureNames:
      getStringArray(input, 'featureNames').length > 0
        ? getStringArray(input, 'featureNames')
        : getStringArray(input, 'feature_names'),
    defaultParameters:
      (getRecord(input, 'defaultParameters') as Record<string, unknown>) ??
      (getRecord(input, 'default_parameters') as Record<string, unknown>) ??
      {},
    artifactFormat:
      getOptionalString(input, 'artifactFormat') ?? getOptionalString(input, 'artifact_format'),
    sourceType:
      (getOptionalString(input, 'sourceType') ?? getOptionalString(input, 'source_type')) as
        | 'uploaded'
        | 'trained'
        | 'custom_api'
        | 'seeded'
        | undefined,
    executionMode:
      (getOptionalString(input, 'executionMode') ?? getOptionalString(input, 'execution_mode')) as
        | 'in_process'
        | 'external_api'
        | undefined,
    visibility:
      (getOptionalString(input, 'visibility') as
        | 'private'
        | 'public'
        | 'workspace'
        | undefined) ?? undefined,
    ownerUserId:
      getOptionalString(input, 'ownerUserId') ?? getOptionalString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ?? getOptionalString(input, 'owner_display_name'),
    metadata:
      Object.keys(getRecord(input, 'metadata')).length > 0
        ? getRecord(input, 'metadata')
        : getRecord(input, 'metadata_json'),
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
  };
}

function normalizeGeeCredential(input: ApiRecord): AssetInputCandidate['geeCredential'] {
  return {
    id: getString(input, 'id'),
    workspaceId: getString(input, 'workspaceId') || getString(input, 'workspace_id'),
    ownerUserId: getString(input, 'ownerUserId') || getString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ?? getOptionalString(input, 'owner_display_name'),
    name: getString(input, 'name'),
    provider: getString(input, 'provider'),
    description: getOptionalString(input, 'description'),
    projectId: getOptionalString(input, 'projectId') ?? getOptionalString(input, 'project_id'),
    serviceAccountEmail:
      getOptionalString(input, 'serviceAccountEmail') ??
      getOptionalString(input, 'service_account_email'),
    isPlatformDefault:
      (input.isPlatformDefault as boolean | undefined) ??
      (input.is_platform_default as boolean | undefined),
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
  };
}

function normalizeAssetInputCandidate(input: ApiRecord): AssetInputCandidate {
  const assetVersionRecord = getRecord(input, 'assetVersion');
  const rawAssetVersion =
    Object.keys(assetVersionRecord).length > 0 ? assetVersionRecord : getRecord(input, 'asset_version');
  const spatialRoiRecord = getRecord(input, 'spatialRoi');
  const rawSpatialRoi =
    Object.keys(spatialRoiRecord).length > 0 ? spatialRoiRecord : getRecord(input, 'spatial_roi');
  const modelVersionRecord = getRecord(input, 'modelVersion');
  const rawModelVersion =
    Object.keys(modelVersionRecord).length > 0 ? modelVersionRecord : getRecord(input, 'model_version');
  const geeCredentialRecord = getRecord(input, 'geeCredential');
  const rawGeeCredential =
    Object.keys(geeCredentialRecord).length > 0
      ? geeCredentialRecord
      : getRecord(input, 'gee_credential');

  return {
    id: getString(input, 'id'),
    consumer: (
      getString(input, 'consumer') || 'workflow_dataset'
    ) as AssetConsumer,
    candidateType:
      (getString(input, 'candidateType') || getString(input, 'candidate_type') || 'asset_version') as
        AssetInputCandidate['candidateType'],
    title: getString(input, 'title'),
    description: getOptionalString(input, 'description'),
    assetVersion:
      Object.keys(rawAssetVersion).length > 0 ? normalizeAssetVersionRef(rawAssetVersion) : undefined,
    spatialRoi:
      Object.keys(rawSpatialRoi).length > 0 ? normalizeSpatialRoi(rawSpatialRoi) : undefined,
    modelVersion:
      Object.keys(rawModelVersion).length > 0 ? normalizeModelVersion(rawModelVersion) : undefined,
    geeCredential:
      Object.keys(rawGeeCredential).length > 0 ? normalizeGeeCredential(rawGeeCredential) : undefined,
  };
}

export async function loadAssetFlowOverview(
  token: string,
  scope: Extract<AssetScope, 'mine' | 'all'> = 'mine',
): Promise<AssetFlowOverview> {
  if (isPortfolioDemo) {
    return clonePlatformMock({
      ...platformMock.assetFlowOverview,
      scope,
    });
  }

  const payload = await requestJson<ApiRecord>(withQuery('/asset-flow/overview', { scope }), token);
  const assetVersionsRaw = Array.isArray(payload.assetVersions)
    ? (payload.assetVersions as ApiRecord[])
    : Array.isArray(payload.asset_versions)
      ? (payload.asset_versions as ApiRecord[])
      : [];
  const executionsRaw = Array.isArray(payload.executions)
    ? (payload.executions as ApiRecord[])
    : [];
  const lineageEdgesRaw = Array.isArray(payload.lineageEdges)
    ? (payload.lineageEdges as ApiRecord[])
    : Array.isArray(payload.lineage_edges)
      ? (payload.lineage_edges as ApiRecord[])
      : [];

  return {
    scope: (getString(payload, 'scope') || scope) as AssetFlowOverview['scope'],
    assetVersions: assetVersionsRaw.map(normalizeAssetVersionRef),
    executions: executionsRaw.map(normalizeExecutionSummary),
    lineageEdges: lineageEdgesRaw.map(normalizeLineageEdge),
  };
}

export async function loadAssetInputCandidates(
  token: string,
  consumer: AssetConsumer,
  scope: AssetScope = 'visible',
): Promise<AssetInputCandidate[]> {
  if (isPortfolioDemo) {
    return clonePlatformMock(
      platformMock.assetInputCandidates.filter((item) => item.consumer === consumer),
    );
  }

  const payload = await requestJson<ApiRecord[]>(
    withQuery('/asset-flow/input-candidates', {
      consumer,
      scope,
    }),
    token,
  );
  return payload.map(normalizeAssetInputCandidate);
}
