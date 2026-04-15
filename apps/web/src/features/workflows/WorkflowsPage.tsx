import type { PlatformDataSnapshot } from '@/lib/api';
import type { WorkflowStarterInputKind, WorkflowValidationResult } from '@platform/types';

import { Alert, App, Button, Card, Col, Modal, Progress, Row, Segmented, Space, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { isApiError } from '@/auth/errors';
import { AssetFlowPanel } from '@/features/asset-flow/AssetFlowPanel';
import {
  readHandoffFromSearchParams,
  removeHandoffFromSearchParams,
} from '@/features/asset-flow/handoff';
import { useAuth } from '@/auth/useAuth';
import { StatCard } from '@/components/StatCard';
import { WorkflowCanvas } from '@/components/WorkflowCanvas';
import { useI18n } from '@/i18n/useI18n';
import {
  createWorkflowRun,
  importWorkflowVersion,
  listSpatialRois,
  listWorkflowVersions,
  saveWorkflowVersion,
  validateWorkflow,
} from '@/lib/api';
import { parseImportedWorkflowGraph } from '@/lib/workflow-import';
import type { WorkflowEditorContext } from './node-registry';
import {
  attachDatasetVersionToWorkflow,
  attachGeeCredentialToWorkflow,
  attachModelVersionToWorkflow,
  attachSavedRoiToWorkflow,
} from './draft-handoff';
import { localizeWorkflowCatalog, localizeWorkflowTemplates } from './workflow-i18n';
import { getEffectiveWorkflowValidationState } from './workflow-validation-state';
import { buildWorkflowStats } from './workflow-utils';

const { Paragraph, Text } = Typography;

const ASSET_IMPORT_PAGINATION = {
  pageSize: 6,
  showSizeChanger: true,
  pageSizeOptions: ['6', '12', '24'],
  hideOnSinglePage: true,
};

type WorkflowViewMode = 'compose' | 'asset_flow';

interface PendingStarterTargetSelection {
  inputKind: WorkflowStarterInputKind;
  resourceId: string;
  label: string;
  matchedNodeIds: string[];
}

export function WorkflowsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message, modal } = App.useApp();
  const { currentUser, hasPermission, token } = useAuth();
  const { locale, t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const platformOwnerLabel = t('assets.platformOwner');
  const renderVisibilityTag = useCallback(
    (visibility: string | undefined) => (
      <Tag color={visibility === 'private' || visibility === undefined ? 'default' : 'blue'}>
        {visibility === 'private' || visibility === undefined
          ? t('assets.visibilityPrivate')
          : t('assets.visibilityPublic')}
      </Tag>
    ),
    [t],
  );
  const [draftWorkflowVersion, setDraftWorkflowVersion] = useState(snapshot.workflowVersion);
  const draftWorkflowVersionRef = useRef(snapshot.workflowVersion);
  const processedWorkflowLinkRef = useRef<string | null>(null);
  const [spatialRois, setSpatialRois] = useState<Awaited<ReturnType<typeof listSpatialRois>>>([]);
  const [spatialRoisLoaded, setSpatialRoisLoaded] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [assetImportOpen, setAssetImportOpen] = useState(false);
  const [assetWorkflowsLoading, setAssetWorkflowsLoading] = useState(false);
  const [assetWorkflowVersions, setAssetWorkflowVersions] = useState<
    Awaited<ReturnType<typeof listWorkflowVersions>>
  >([]);
  const [selectedAssetWorkflowId, setSelectedAssetWorkflowId] = useState<string | null>(null);
  const [runProgressOpen, setRunProgressOpen] = useState(false);
  const [runProgressPercent, setRunProgressPercent] = useState(0);
  const [runProgressMessage, setRunProgressMessage] = useState('');
  const [lastValidationResult, setLastValidationResult] = useState<WorkflowValidationResult | null>(null);
  const [lastValidationGraphSignature, setLastValidationGraphSignature] = useState<string | null>(null);
  const runProgressTimerRef = useRef<number | null>(null);
  const [assetFlowRefreshSignal, setAssetFlowRefreshSignal] = useState(0);
  const [viewMode, setViewMode] = useState<WorkflowViewMode>('compose');
  const [handoffNotice, setHandoffNotice] = useState<{
    type: 'success' | 'warning';
    title: string;
    description: string;
  } | null>(null);
  const [pendingStarterTargetSelection, setPendingStarterTargetSelection] =
    useState<PendingStarterTargetSelection | null>(null);
  const workflowModeCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            composeLabel: '编排',
            composeDescription: '运行前的工作流图编排、校验与保存。',
            assetFlowLabel: '资产流',
            assetFlowDescription: '运行后的输入资产、执行链路与结果资产衔接。',
          }
        : {
            composeLabel: 'Composer',
            composeDescription: 'Build, validate, and save the workflow graph before execution.',
            assetFlowLabel: 'Asset Flow',
            assetFlowDescription:
              'Review post-run lineage between inputs, executions, and reusable outputs.',
          },
    [locale],
  );
  const localizedWorkflowCatalog = useMemo(
    () => localizeWorkflowCatalog(locale, snapshot.workflowCatalog),
    [locale, snapshot.workflowCatalog],
  );
  const localizedWorkflowTemplates = useMemo(
    () => localizeWorkflowTemplates(locale, snapshot.workflowTemplates),
    [locale, snapshot.workflowTemplates],
  );
  const stats = useMemo(
    () => buildWorkflowStats(localizedWorkflowCatalog, draftWorkflowVersion),
    [draftWorkflowVersion, localizedWorkflowCatalog],
  );
  const workflowEditorContext = useMemo<WorkflowEditorContext>(
    () => ({
      datasets: snapshot.datasets,
      datasetVersions: snapshot.datasetVersions,
      geeCredentials: snapshot.geeCredentials,
      modelVersions: snapshot.modelVersions,
      spatialRois,
    }),
    [
      snapshot.datasets,
      snapshot.datasetVersions,
      snapshot.geeCredentials,
      snapshot.modelVersions,
      spatialRois,
    ],
  );
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draftWorkflowVersion.graph) !== JSON.stringify(snapshot.workflowVersion.graph),
    [draftWorkflowVersion.graph, snapshot.workflowVersion.graph],
  );
  const runTableCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            resultDataset: '结果数据集',
            metrics: '评测指标',
            openInMap: '在地图中打开',
            appliedInput: '这个输出已经写入当前工作流草稿。',
            datasetLinked: '已把上游数据带入当前工作流草稿。',
            datasetLinkMissing: '当前工作流里没有可接收数据集版本的源节点。',
            roiLinked: '已把 ROI 带入当前工作流草稿。',
            roiLinkMissing: '当前工作流里没有 Sentinel ROI 节点。',
          }
        : {
            resultDataset: 'Result Dataset',
            metrics: 'Metrics',
            openInMap: 'Open In Map',
            appliedInput: 'This output is now bound to the current workflow draft.',
            datasetLinked: 'The upstream dataset has been attached to the current workflow draft.',
            datasetLinkMissing: 'The current workflow does not contain a dataset source node.',
            roiLinked: 'The ROI has been attached to the current workflow draft.',
            roiLinkMissing: 'The current workflow does not contain a Sentinel ROI node.',
          },
    [locale],
  );
  const runProgressCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            title: 'Sentinel 下载进行中',
            preparing: '正在准备工作流...',
            authenticating: '正在连接 Google Earth Engine...',
            searching: '正在检索 Sentinel 场景...',
            downloading: '正在下载栅格数据...',
            finalizing: '正在保存结果到平台...',
            completed: '下载完成。',
            failed: '下载失败。',
          }
        : {
            title: 'Sentinel Download In Progress',
            preparing: 'Preparing workflow...',
            authenticating: 'Connecting to Google Earth Engine...',
            searching: 'Searching Sentinel scenes...',
            downloading: 'Downloading raster data...',
            finalizing: 'Saving result to the platform...',
            completed: 'Download completed.',
            failed: 'Download failed.',
          },
    [locale],
  );
  const starterLinkCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            datasetAmbiguous: '当前工作流中有多个可接收数据集输入的节点，请先明确目标节点。',
            modelMissing: '当前工作流没有可接收模型版本的节点。',
            modelAmbiguous: '当前工作流中有多个可接收模型版本输入的节点，请先明确目标节点。',
            roiAmbiguous: '当前工作流中有多个可接收 ROI 输入的节点，请先明确目标节点。',
            geeMissing: '当前工作流没有可接收 GEE 凭据的节点。',
            geeAmbiguous: '当前工作流中有多个可接收 GEE 凭据输入的节点，请先明确目标节点。',
            chooserTitle: '选择目标节点',
            chooserDescription: '这个输入可以接到多个节点，请明确要绑定到哪一个 starter。',
            chooserSelect: '绑定到此节点',
            chooserCurrentValue: '当前值',
            chooserUnbound: '未绑定',
            chooserApplied: '已绑定到所选 starter 节点。',
          }
        : {
            datasetAmbiguous:
              'The current workflow exposes multiple compatible dataset starters. Select one explicitly before retrying.',
            modelMissing: 'The current workflow does not expose any compatible model starter.',
            modelAmbiguous:
              'The current workflow exposes multiple compatible model starters. Select one explicitly before retrying.',
            roiAmbiguous:
              'The current workflow exposes multiple compatible ROI starters. Select one explicitly before retrying.',
            geeMissing: 'The current workflow does not expose any compatible GEE starter.',
            geeAmbiguous:
              'The current workflow exposes multiple compatible GEE starters. Select one explicitly before retrying.',
            chooserTitle: 'Select Target Node',
            chooserDescription:
              'This input matches multiple starter nodes. Choose which node should receive it.',
            chooserSelect: 'Bind To This Node',
            chooserCurrentValue: 'Current value',
            chooserUnbound: 'Unbound',
            chooserApplied: 'The input has been bound to the selected starter node.',
          },
    [locale],
  );
  const handoffCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            datasetReceived: (label: string) => `已接收数据集输入：${label}`,
            modelReceived: (label: string) => `已接收模型输入：${label}`,
            roiReceived: (label: string) => `已接收 ROI：${label}`,
            geeReceived: (label: string) => `已接收 GEE 凭据：${label}`,
            unableBindTarget: (label: string) => `未能绑定到目标节点：${label}`,
            unableReceiveDataset: (label: string) => `未能接收数据集输入：${label}`,
            unableReceiveModel: (label: string) => `未能接收模型输入：${label}`,
            unableReceiveRoi: (label: string) => `未能接收 ROI：${label}`,
            unableReceiveGee: (label: string) => `未能接收 GEE 凭据：${label}`,
            datasetUnavailable: '该数据集版本在当前作用域中已不可用。',
            modelUnavailable: '该模型版本在当前作用域中已不可用。',
            roiUnavailable: '该 ROI 在当前作用域中已不可用。',
            geeUnavailable: '该 GEE 凭据在当前作用域中已不可用。',
            datasetCreatedStarter:
              '当前草稿中没有兼容的数据集 starter，已自动创建并绑定到该版本。',
            datasetBoundExisting: '该数据集版本已绑定到当前草稿中的兼容节点。',
            modelCreatedStarter: '已自动添加模型 starter 节点并绑定到该版本。',
            modelBoundExisting: '该模型版本已绑定到当前草稿中的兼容节点。',
            roiCreatedStarter:
              '当前草稿中没有兼容的 Sentinel ROI starter，已自动创建并绑定到该 ROI。',
            roiBoundExisting: '该 ROI 已绑定到当前草稿中的兼容节点。',
            geeCreatedStarter:
              '已自动添加兼容的 Sentinel starter 节点并绑定到该凭据。',
            geeBoundExisting: '该凭据已绑定到当前草稿中的兼容节点。',
            modelAttached: '模型版本已附加到当前工作流草稿。',
            geeAttached: 'GEE 凭据已附加到当前工作流草稿。',
          }
        : {
            datasetReceived: (label: string) => `Dataset input received: ${label}`,
            modelReceived: (label: string) => `Model input received: ${label}`,
            roiReceived: (label: string) => `ROI received: ${label}`,
            geeReceived: (label: string) => `GEE credential received: ${label}`,
            unableBindTarget: (label: string) => `Unable to bind to target node: ${label}`,
            unableReceiveDataset: (label: string) => `Unable to receive dataset input: ${label}`,
            unableReceiveModel: (label: string) => `Unable to receive model input: ${label}`,
            unableReceiveRoi: (label: string) => `Unable to receive ROI: ${label}`,
            unableReceiveGee: (label: string) => `Unable to receive GEE credential: ${label}`,
            datasetUnavailable: 'This dataset version is no longer available in the current scope.',
            modelUnavailable: 'This model version is no longer available in the current scope.',
            roiUnavailable: 'This ROI is no longer available in the current scope.',
            geeUnavailable: 'This GEE credential is no longer available in the current scope.',
            datasetCreatedStarter:
              'The draft had no dataset starter node, so one was created automatically and bound to this version.',
            datasetBoundExisting:
              'This dataset version has been bound to an existing compatible node in the current draft.',
            modelCreatedStarter: 'A model starter node was added automatically and bound to this version.',
            modelBoundExisting:
              'This model version has been bound to an existing compatible node in the current draft.',
            roiCreatedStarter:
              'The draft had no compatible Sentinel ROI starter, so one was created automatically and bound to this ROI.',
            roiBoundExisting: 'This ROI has been bound to an existing compatible node in the current draft.',
            geeCreatedStarter:
              'A compatible Sentinel starter node was added automatically and bound to this credential.',
            geeBoundExisting: 'This credential has been bound to an existing compatible node in the current draft.',
            modelAttached: 'The model version has been attached to the current workflow draft.',
            geeAttached: 'The GEE credential has been attached to the current workflow draft.',
          },
    [locale],
  );
  const hasSentinelDownload = useMemo(
    () =>
      draftWorkflowVersion.graph.nodes.some((node) => node.type === 'source.sentinel2_gee_download'),
    [draftWorkflowVersion.graph.nodes],
  );
  const pendingStarterTargetCandidates = useMemo(
    () => {
      if (!pendingStarterTargetSelection) {
        return [];
      }

      return pendingStarterTargetSelection.matchedNodeIds.reduce<
        Array<{
          nodeId: string;
          nodeType: string;
          label: string;
          currentValue: string | undefined;
        }>
      >((candidates, nodeId) => {
          const node = draftWorkflowVersion.graph.nodes.find((item) => item.id === nodeId);
          if (!node) {
            return candidates;
          }
          const definition = localizedWorkflowCatalog.find((item) => item.type === node.type);
          const binding = definition?.starterBindings?.find(
            (item) => item.inputKind === pendingStarterTargetSelection.inputKind,
          );
          const currentValue =
            binding && typeof node.params[binding.paramKey] === 'string'
              ? String(node.params[binding.paramKey]).trim() || undefined
              : undefined;
          candidates.push({
            nodeId,
            nodeType: node.type,
            label: definition?.label ?? node.type,
            currentValue,
          });
          return candidates;
        }, []);
    },
    [draftWorkflowVersion.graph.nodes, localizedWorkflowCatalog, pendingStarterTargetSelection],
  );
  const effectiveValidationState = useMemo(
    () =>
      getEffectiveWorkflowValidationState({
        definitions: localizedWorkflowCatalog,
        workflowVersion: draftWorkflowVersion,
        context: workflowEditorContext,
        validationResult: lastValidationResult,
        validationGraphSignature: lastValidationGraphSignature,
      }),
    [
      draftWorkflowVersion,
      lastValidationGraphSignature,
      lastValidationResult,
      localizedWorkflowCatalog,
      workflowEditorContext,
    ],
  );
  const runDisabled =
    !draftWorkflowVersion.graph.nodes.length || effectiveValidationState.hasErrors;
  const openStarterTargetSelection = useCallback(
    (
      inputKind: WorkflowStarterInputKind,
      resourceId: string,
      label: string,
      matchedNodeIds: string[],
    ) => {
      if (matchedNodeIds.length < 2) {
        return;
      }
      setPendingStarterTargetSelection({
        inputKind,
        resourceId,
        label,
        matchedNodeIds,
      });
    },
    [],
  );
  const applyExplicitStarterTarget = useCallback(
    (targetNodeId: string) => {
      if (!pendingStarterTargetSelection) {
        return;
      }

      let result:
        | ReturnType<typeof attachDatasetVersionToWorkflow>
        | ReturnType<typeof attachSavedRoiToWorkflow>
        | ReturnType<typeof attachModelVersionToWorkflow>
        | ReturnType<typeof attachGeeCredentialToWorkflow>;
      let successTitle = pendingStarterTargetSelection.label;
      let successMessage = starterLinkCopy.chooserApplied;
      let failureDescription = '';

      if (pendingStarterTargetSelection.inputKind === 'dataset_version') {
        result = attachDatasetVersionToWorkflow(
          draftWorkflowVersionRef.current,
          pendingStarterTargetSelection.resourceId,
          localizedWorkflowCatalog,
          workflowEditorContext,
          { targetNodeId },
        );
        successTitle =
          locale === 'zh-CN'
            ? `已接收数据输入：${pendingStarterTargetSelection.label}`
            : `Dataset input received: ${pendingStarterTargetSelection.label}`;
        successMessage = runTableCopy.datasetLinked;
        failureDescription = runTableCopy.datasetLinkMissing;
      } else if (pendingStarterTargetSelection.inputKind === 'spatial_roi') {
        result = attachSavedRoiToWorkflow(
          draftWorkflowVersionRef.current,
          pendingStarterTargetSelection.resourceId,
          localizedWorkflowCatalog,
          workflowEditorContext,
          { targetNodeId },
        );
        successTitle =
          locale === 'zh-CN'
            ? `已接收 ROI：${pendingStarterTargetSelection.label}`
            : `ROI received: ${pendingStarterTargetSelection.label}`;
        successMessage = runTableCopy.roiLinked;
        failureDescription = runTableCopy.roiLinkMissing;
      } else if (pendingStarterTargetSelection.inputKind === 'model_version') {
        result = attachModelVersionToWorkflow(
          draftWorkflowVersionRef.current,
          pendingStarterTargetSelection.resourceId,
          localizedWorkflowCatalog,
          workflowEditorContext,
          { targetNodeId },
        );
        successTitle = handoffCopy.modelReceived(pendingStarterTargetSelection.label);
        successMessage = handoffCopy.modelAttached;
        failureDescription = starterLinkCopy.modelMissing;
      } else {
        result = attachGeeCredentialToWorkflow(
          draftWorkflowVersionRef.current,
          pendingStarterTargetSelection.resourceId,
          localizedWorkflowCatalog,
          workflowEditorContext,
          { targetNodeId },
        );
        successTitle = handoffCopy.geeReceived(pendingStarterTargetSelection.label);
        successMessage = handoffCopy.geeAttached;
        failureDescription = starterLinkCopy.geeMissing;
      }

      if (result.applied) {
        draftWorkflowVersionRef.current = result.workflowVersion;
        setDraftWorkflowVersion(result.workflowVersion);
        setHandoffNotice({
          type: 'success',
          title: successTitle,
          description: starterLinkCopy.chooserApplied,
        });
        message.success(successMessage);
      } else {
        setHandoffNotice({
          type: 'warning',
          title:
            locale === 'zh-CN'
              ? `未能绑定到目标节点：${pendingStarterTargetSelection.label}`
              : `Unable to bind to target node: ${pendingStarterTargetSelection.label}`,
          description: failureDescription,
        });
        message.warning(failureDescription);
      }

      setPendingStarterTargetSelection(null);
    },
    [
      locale,
      message,
      pendingStarterTargetSelection,
      runTableCopy.datasetLinkMissing,
      runTableCopy.datasetLinked,
      runTableCopy.roiLinkMissing,
      runTableCopy.roiLinked,
      handoffCopy,
      localizedWorkflowCatalog,
      starterLinkCopy.chooserApplied,
      starterLinkCopy.geeMissing,
      starterLinkCopy.modelMissing,
      workflowEditorContext,
    ],
  );

  useEffect(() => {
    draftWorkflowVersionRef.current = snapshot.workflowVersion;
    setDraftWorkflowVersion(snapshot.workflowVersion);
  }, [snapshot.workflowVersion]);

  useEffect(() => {
    draftWorkflowVersionRef.current = draftWorkflowVersion;
  }, [draftWorkflowVersion]);

  useEffect(() => {
    if (!token) {
      setSpatialRois([]);
      setSpatialRoisLoaded(true);
      return;
    }

    let disposed = false;
    const scope = currentUser?.role === 'ADMIN' ? 'all' : 'visible';
    setSpatialRoisLoaded(false);
    void listSpatialRois(token, scope)
      .then((items) => {
        if (!disposed) {
          setSpatialRois(items);
          setSpatialRoisLoaded(true);
        }
      })
      .catch(() => {
        if (!disposed) {
          setSpatialRois([]);
          setSpatialRoisLoaded(true);
        }
      });

    return () => {
      disposed = true;
    };
  }, [currentUser?.role, token]);

  useEffect(() => {
    const handoff = readHandoffFromSearchParams(searchParams);
    const hasWorkflowInputLink =
      (handoff?.target === 'workflow' &&
        (handoff.inputKind === 'dataset_version' ||
          handoff.inputKind === 'spatial_roi' ||
          handoff.inputKind === 'model_version' ||
          handoff.inputKind === 'gee_credential')) ||
      searchParams.has('datasetVersionId') ||
      searchParams.has('roiId') ||
      searchParams.has('modelVersionId') ||
      searchParams.has('geeCredentialId');

    if (hasWorkflowInputLink) {
      setViewMode('compose');
    }
  }, [searchParams]);

  useEffect(() => {
    const handoff = readHandoffFromSearchParams(searchParams);
    const linkedDatasetVersionId =
      handoff?.target === 'workflow' && handoff.inputKind === 'dataset_version'
        ? handoff.datasetVersionId
        : searchParams.get('datasetVersionId');
    const linkedRoiId =
      handoff?.target === 'workflow' && handoff.inputKind === 'spatial_roi'
        ? handoff.roiId
        : searchParams.get('roiId');
    const linkedModelVersionId =
      handoff?.target === 'workflow' && handoff.inputKind === 'model_version'
        ? handoff.modelVersionId
        : searchParams.get('modelVersionId');
    const linkedGeeCredentialId =
      handoff?.target === 'workflow' && handoff.inputKind === 'gee_credential'
        ? handoff.geeCredentialId
        : searchParams.get('geeCredentialId');
    const pendingLinkKey = linkedDatasetVersionId
      ? `dataset:${linkedDatasetVersionId}`
      : linkedRoiId
        ? `roi:${linkedRoiId}`
        : linkedModelVersionId
          ? `model:${linkedModelVersionId}`
          : linkedGeeCredentialId
            ? `gee:${linkedGeeCredentialId}`
        : null;

    if (!pendingLinkKey) {
      processedWorkflowLinkRef.current = null;
      return;
    }

    if (processedWorkflowLinkRef.current === pendingLinkKey) {
      return;
    }

    if (linkedRoiId && !spatialRoisLoaded) {
      return;
    }

    processedWorkflowLinkRef.current = pendingLinkKey;

    let nextWorkflowVersion = draftWorkflowVersionRef.current;
    let changed = false;
    if (linkedDatasetVersionId) {
      const datasetVersionExists = snapshot.datasetVersions.some(
        (item) => item.id === linkedDatasetVersionId,
      );
      if (!datasetVersionExists) {
        setHandoffNotice({
          type: 'warning',
          title:
            locale === 'zh-CN'
              ? `未能接收数据输入：${handoff?.label ?? linkedDatasetVersionId}`
              : `Unable to receive dataset input: ${handoff?.label ?? linkedDatasetVersionId}`,
          description:
            locale === 'zh-CN'
              ? '该数据版本已不存在，或已经不在当前用户可见范围内。'
              : 'This dataset version is no longer available in the current scope.',
        });
        message.warning(
          locale === 'zh-CN'
            ? '该数据版本已不存在，或不在当前可见范围内。'
            : 'This dataset version is no longer available in the current scope.',
        );
      } else {
        const linkedDatasetResult = attachDatasetVersionToWorkflow(
          nextWorkflowVersion,
          linkedDatasetVersionId,
          localizedWorkflowCatalog,
          workflowEditorContext,
          {
            targetNodeId: handoff?.target === 'workflow' ? handoff.targetNodeId : undefined,
          },
        );
        if (linkedDatasetResult.applied) {
          nextWorkflowVersion = linkedDatasetResult.workflowVersion;
          changed = true;
          setHandoffNotice({
            type: 'success',
            title:
              locale === 'zh-CN'
                ? `已接收数据输入：${handoff?.label ?? linkedDatasetVersionId}`
                : `Dataset input received: ${handoff?.label ?? linkedDatasetVersionId}`,
            description:
              locale === 'zh-CN'
                ? linkedDatasetResult.createdStarter
                  ? '当前草稿里原本没有数据集起点，系统已自动补入一个数据集源节点并绑定该版本。'
                  : '该数据版本已经绑定到当前工作流草稿中的可接收节点。'
                : linkedDatasetResult.createdStarter
                  ? 'The draft had no dataset starter node, so one was created automatically and bound to this version.'
                  : 'This dataset version has been bound to an existing compatible node in the current draft.',
          });
          message.success(runTableCopy.datasetLinked);
        } else {
          const datasetFailureDescription =
            linkedDatasetResult.failureReason === 'ambiguous_existing_target'
              ? starterLinkCopy.datasetAmbiguous
              : runTableCopy.datasetLinkMissing;
          if (linkedDatasetResult.failureReason === 'ambiguous_existing_target') {
            openStarterTargetSelection(
              'dataset_version',
              linkedDatasetVersionId,
              handoff?.label ?? linkedDatasetVersionId,
              linkedDatasetResult.matchedNodeIds ?? [],
            );
          }
          setHandoffNotice({
            type: 'warning',
            title:
              locale === 'zh-CN'
                ? `未能接收数据输入：${handoff?.label ?? linkedDatasetVersionId}`
                : `Unable to receive dataset input: ${handoff?.label ?? linkedDatasetVersionId}`,
            description: datasetFailureDescription,
          });
          message.warning(datasetFailureDescription);
        }
      }
    } else if (linkedModelVersionId) {
      const modelVersionExists = snapshot.modelVersions.some((item) => item.id === linkedModelVersionId);
      if (!modelVersionExists) {
        setHandoffNotice({
          type: 'warning',
          title: handoffCopy.unableReceiveModel(handoff?.label ?? linkedModelVersionId),
          description: handoffCopy.modelUnavailable,
        });
        message.warning(handoffCopy.modelUnavailable);
      } else {
        const linkedModelResult = attachModelVersionToWorkflow(
          nextWorkflowVersion,
          linkedModelVersionId,
          localizedWorkflowCatalog,
          workflowEditorContext,
          {
            targetNodeId: handoff?.target === 'workflow' ? handoff.targetNodeId : undefined,
          },
        );
        if (linkedModelResult.applied) {
          nextWorkflowVersion = linkedModelResult.workflowVersion;
          changed = true;
          setHandoffNotice({
            type: 'success',
            title: handoffCopy.modelReceived(handoff?.label ?? linkedModelVersionId),
            description: linkedModelResult.createdStarter
              ? handoffCopy.modelCreatedStarter
              : handoffCopy.modelBoundExisting,
          });
          message.success(handoffCopy.modelAttached);
        } else {
          const modelFailureDescription =
            linkedModelResult.failureReason === 'ambiguous_existing_target'
              ? starterLinkCopy.modelAmbiguous
              : starterLinkCopy.modelMissing;
          if (linkedModelResult.failureReason === 'ambiguous_existing_target') {
            openStarterTargetSelection(
              'model_version',
              linkedModelVersionId,
              handoff?.label ?? linkedModelVersionId,
              linkedModelResult.matchedNodeIds ?? [],
            );
          }
          setHandoffNotice({
            type: 'warning',
            title: handoffCopy.unableReceiveModel(handoff?.label ?? linkedModelVersionId),
            description: modelFailureDescription,
          });
          message.warning(modelFailureDescription);
        }
      }
    } else if (linkedRoiId) {
      const roiExists = spatialRois.some((item) => item.id === linkedRoiId);
      if (!roiExists) {
        setHandoffNotice({
          type: 'warning',
          title:
            locale === 'zh-CN'
              ? `未能接收 ROI：${handoff?.label ?? linkedRoiId}`
              : `Unable to receive ROI: ${handoff?.label ?? linkedRoiId}`,
          description:
            locale === 'zh-CN'
              ? '该 ROI 已不存在，或已经不在当前用户可见范围内。'
              : 'This ROI is no longer available in the current scope.',
        });
        message.warning(
          locale === 'zh-CN'
            ? '该 ROI 已不存在，或不在当前可见范围内。'
            : 'This ROI is no longer available in the current scope.',
        );
      } else {
        const linkedRoiResult = attachSavedRoiToWorkflow(
          nextWorkflowVersion,
          linkedRoiId,
          localizedWorkflowCatalog,
          workflowEditorContext,
          {
            targetNodeId: handoff?.target === 'workflow' ? handoff.targetNodeId : undefined,
          },
        );
        if (linkedRoiResult.applied) {
          nextWorkflowVersion = linkedRoiResult.workflowVersion;
          changed = true;
          setHandoffNotice({
            type: 'success',
            title:
              locale === 'zh-CN'
                ? `已接收 ROI：${handoff?.label ?? linkedRoiId}`
                : `ROI received: ${handoff?.label ?? linkedRoiId}`,
            description:
              locale === 'zh-CN'
                ? linkedRoiResult.createdStarter
                  ? '当前草稿里原本没有 Sentinel ROI 起点，系统已自动补入对应源节点并绑定该 ROI。'
                  : '该 ROI 已经绑定到当前工作流草稿中的可接收节点。'
                : linkedRoiResult.createdStarter
                  ? 'The draft had no compatible Sentinel ROI starter, so one was created automatically and bound to this ROI.'
                  : 'This ROI has been bound to an existing compatible node in the current draft.',
          });
          message.success(runTableCopy.roiLinked);
        } else {
          const roiFailureDescription =
            linkedRoiResult.failureReason === 'ambiguous_existing_target'
              ? starterLinkCopy.roiAmbiguous
              : runTableCopy.roiLinkMissing;
          if (linkedRoiResult.failureReason === 'ambiguous_existing_target') {
            openStarterTargetSelection(
              'spatial_roi',
              linkedRoiId,
              handoff?.label ?? linkedRoiId,
              linkedRoiResult.matchedNodeIds ?? [],
            );
          }
          setHandoffNotice({
            type: 'warning',
            title:
              locale === 'zh-CN'
                ? `未能接收 ROI：${handoff?.label ?? linkedRoiId}`
                : `Unable to receive ROI: ${handoff?.label ?? linkedRoiId}`,
            description: roiFailureDescription,
          });
          message.warning(roiFailureDescription);
        }
      }
    } else if (linkedGeeCredentialId) {
      const credentialExists = snapshot.geeCredentials.some((item) => item.id === linkedGeeCredentialId);
      if (!credentialExists) {
        setHandoffNotice({
          type: 'warning',
          title: handoffCopy.unableReceiveGee(handoff?.label ?? linkedGeeCredentialId),
          description: handoffCopy.geeUnavailable,
        });
        message.warning(handoffCopy.geeUnavailable);
      } else {
        const linkedCredentialResult = attachGeeCredentialToWorkflow(
          nextWorkflowVersion,
          linkedGeeCredentialId,
          localizedWorkflowCatalog,
          workflowEditorContext,
          {
            targetNodeId: handoff?.target === 'workflow' ? handoff.targetNodeId : undefined,
          },
        );
        if (linkedCredentialResult.applied) {
          nextWorkflowVersion = linkedCredentialResult.workflowVersion;
          changed = true;
          setHandoffNotice({
            type: 'success',
            title: handoffCopy.geeReceived(handoff?.label ?? linkedGeeCredentialId),
            description: linkedCredentialResult.createdStarter
              ? handoffCopy.geeCreatedStarter
              : handoffCopy.geeBoundExisting,
          });
          message.success(handoffCopy.geeAttached);
        } else {
          const geeFailureDescription =
            linkedCredentialResult.failureReason === 'ambiguous_existing_target'
              ? starterLinkCopy.geeAmbiguous
              : starterLinkCopy.geeMissing;
          if (linkedCredentialResult.failureReason === 'ambiguous_existing_target') {
            openStarterTargetSelection(
              'gee_credential',
              linkedGeeCredentialId,
              handoff?.label ?? linkedGeeCredentialId,
              linkedCredentialResult.matchedNodeIds ?? [],
            );
          }
          setHandoffNotice({
            type: 'warning',
            title: handoffCopy.unableReceiveGee(handoff?.label ?? linkedGeeCredentialId),
            description: geeFailureDescription,
          });
          message.warning(geeFailureDescription);
        }
      }
    }
    if (changed) {
      draftWorkflowVersionRef.current = nextWorkflowVersion;
      setDraftWorkflowVersion(nextWorkflowVersion);
    }

    const nextSearch = removeHandoffFromSearchParams(searchParams);
    nextSearch.delete('datasetVersionId');
    nextSearch.delete('roiId');
    nextSearch.delete('modelVersionId');
    nextSearch.delete('geeCredentialId');
    setSearchParams(nextSearch, { replace: true });
  }, [
    locale,
    handoffCopy,
    message,
    openStarterTargetSelection,
    runTableCopy,
    searchParams,
    setSearchParams,
    snapshot.datasetVersions,
    snapshot.geeCredentials,
    snapshot.modelVersions,
    localizedWorkflowCatalog,
    starterLinkCopy,
    spatialRois,
    spatialRoisLoaded,
    workflowEditorContext,
  ]);

  const stopRunProgressTimer = useCallback(() => {
    if (runProgressTimerRef.current !== null) {
      window.clearInterval(runProgressTimerRef.current);
      runProgressTimerRef.current = null;
    }
  }, []);

  const startRunProgress = useCallback(() => {
    if (!hasSentinelDownload) {
      return;
    }

    stopRunProgressTimer();
    setRunProgressPercent(6);
    setRunProgressMessage(runProgressCopy.preparing);
    setRunProgressOpen(true);

    const startedAt = Date.now();
    runProgressTimerRef.current = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      if (elapsedSeconds < 2) {
        setRunProgressPercent((current) => Math.max(current, 18));
        setRunProgressMessage(runProgressCopy.authenticating);
        return;
      }
      if (elapsedSeconds < 8) {
        setRunProgressPercent((current) => Math.max(current, 46));
        setRunProgressMessage(runProgressCopy.searching);
        return;
      }
      if (elapsedSeconds < 15) {
        setRunProgressPercent((current) => Math.max(current, 78));
        setRunProgressMessage(runProgressCopy.downloading);
        return;
      }
      setRunProgressPercent((current) => Math.min(Math.max(current, 90), 94));
      setRunProgressMessage(runProgressCopy.finalizing);
    }, 700);
  }, [hasSentinelDownload, runProgressCopy, stopRunProgressTimer]);

  const finishRunProgress = useCallback(
    (nextMessage: string) => {
      if (!hasSentinelDownload) {
        return;
      }

      stopRunProgressTimer();
      setRunProgressPercent(100);
      setRunProgressMessage(nextMessage);
      window.setTimeout(() => setRunProgressOpen(false), 450);
    },
    [hasSentinelDownload, stopRunProgressTimer],
  );

  useEffect(
    () => () => {
      stopRunProgressTimer();
    },
    [stopRunProgressTimer],
  );

  const onValidate = async () => {
    if (!token) {
      return;
    }
    try {
      const graphSignature = JSON.stringify(draftWorkflowVersion.graph);
      const result = await validateWorkflow(token, draftWorkflowVersion);
      setLastValidationResult(result);
      setLastValidationGraphSignature(graphSignature);
      if (result.valid) {
        message.success(t('workflows.validateSuccess'));
      } else {
        message.warning(`${t('workflows.validateFailure')} (${result.errors.length})`);
      }
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const onSave = async () => {
    if (!token) {
      return;
    }
    try {
      const saved = await saveWorkflowVersion(token, draftWorkflowVersion);
      setDraftWorkflowVersion(saved);
      message.success(t('workflows.saveSuccess'));
      await onRefresh();
      setAssetFlowRefreshSignal((current) => current + 1);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const onRun = async () => {
    if (!token) {
      return;
    }
    try {
      startRunProgress();
      let workflowVersionToRun = draftWorkflowVersion;

      if (hasPermission('workflow.manage') && hasUnsavedChanges) {
        workflowVersionToRun = await saveWorkflowVersion(token, draftWorkflowVersion);
        setDraftWorkflowVersion(workflowVersionToRun);
      }

      const run = await createWorkflowRun(token, workflowVersionToRun, snapshot.workspace.id);
      if (run.status === 'failed') {
        finishRunProgress(runProgressCopy.failed);
        message.error(run.errorMessage ?? t('workflows.runFailed'));
      } else if (run.status === 'queued' || run.status === 'running') {
        finishRunProgress(runProgressCopy.completed);
        message.success(t('workflows.runQueued'));
      } else {
        finishRunProgress(runProgressCopy.completed);
        message.success(t('workflows.runCompleted'));
      }
      await onRefresh();
      setAssetFlowRefreshSignal((current) => current + 1);
    } catch (error) {
      finishRunProgress(runProgressCopy.failed);
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const downloadDraftWorkflow = () => {
    const payload = {
      nodes: draftWorkflowVersion.graph.nodes,
      edges: draftWorkflowVersion.graph.edges,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `workflow-v${draftWorkflowVersion.version}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importWorkflowFile = async (file: File) => {
    if (!token) {
      return;
    }

    try {
      const text = await file.text();
      const graph = parseImportedWorkflowGraph(text);
      const imported = await importWorkflowVersion(token, graph);
      setDraftWorkflowVersion(imported);
      message.success(t('workflows.importSuccess'));
      await onRefresh();
      setAssetFlowRefreshSignal((current) => current + 1);
    } catch (error) {
      if (error instanceof SyntaxError) {
        message.error(t('workflows.importInvalid'));
        return;
      }
      message.error(isApiError(error) ? error.message : t('workflows.importInvalid'));
    }
  };

  const onImportWorkflowClick = () => {
    if (!hasPermission('workflow.manage')) {
      return;
    }

    if (hasUnsavedChanges) {
      modal.confirm({
        title: t('workflows.importConfirmTitle'),
        content: t('workflows.importConfirmBody'),
        onOk: () => importInputRef.current?.click(),
      });
      return;
    }

    importInputRef.current?.click();
  };

  const openAssetWorkflowPicker = async () => {
    if (!token || !hasPermission('workflow.manage')) {
      return;
    }

    try {
      setAssetWorkflowsLoading(true);
      const workflows = await listWorkflowVersions(token, 'visible');
      setAssetWorkflowVersions(workflows);
      setSelectedAssetWorkflowId(workflows[0]?.id ?? null);
      setAssetImportOpen(true);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setAssetWorkflowsLoading(false);
    }
  };

  const importSelectedAssetWorkflow = () => {
    const selectedWorkflow = assetWorkflowVersions.find((item) => item.id === selectedAssetWorkflowId);
    if (!selectedWorkflow) {
      message.warning(t('workflows.assetImportEmpty'));
      return;
    }

    const applySelectedWorkflow = () => {
      setDraftWorkflowVersion({
        id: selectedWorkflow.id,
        workflowId: selectedWorkflow.workflowId,
        version: selectedWorkflow.version,
        ownerUserId: selectedWorkflow.ownerUserId,
        ownerDisplayName: selectedWorkflow.ownerDisplayName,
        graph: selectedWorkflow.graph,
        createdAt: selectedWorkflow.createdAt,
      });
      setAssetImportOpen(false);
      message.success(t('workflows.assetImportSuccess'));
    };

    if (hasUnsavedChanges) {
      modal.confirm({
        title: t('workflows.importConfirmTitle'),
        content: t('workflows.importConfirmBody'),
        onOk: applySelectedWorkflow,
      });
      return;
    }

    applySelectedWorkflow();
  };

  return (
    <div className="page-stack">
      <input
        ref={importInputRef}
        hidden
        type="file"
        accept=".json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void importWorkflowFile(file);
          }
          event.currentTarget.value = '';
        }}
      />
      <div className="section-header">
        <div className="section-header-actions">
          <div>
            <div className="panel-kicker">{t('workflows.kicker')}</div>
            <h2 className="section-title">{t('workflows.title')}</h2>
            <Paragraph className="section-copy">{t('workflows.copy')}</Paragraph>
          </div>
        </div>
      </div>

      <Card className="panel-card workflow-page-mode-bar" variant="borderless">
        <div className="workflow-page-mode-copy">
          <div className="panel-kicker">
            {viewMode === 'compose'
              ? workflowModeCopy.composeLabel
              : workflowModeCopy.assetFlowLabel}
          </div>
          <Paragraph className="workflow-page-mode-description">
            {viewMode === 'compose'
              ? workflowModeCopy.composeDescription
              : workflowModeCopy.assetFlowDescription}
          </Paragraph>
        </div>
        <Segmented
          value={viewMode}
          options={[
            { label: workflowModeCopy.composeLabel, value: 'compose' },
            { label: workflowModeCopy.assetFlowLabel, value: 'asset_flow' },
          ]}
          onChange={(value) => setViewMode(value as WorkflowViewMode)}
        />
      </Card>

      {handoffNotice ? (
        <Alert
          type={handoffNotice.type}
          showIcon
          closable
          className="workflow-handoff-alert"
          message={handoffNotice.title}
          description={handoffNotice.description}
          onClose={() => setHandoffNotice(null)}
        />
      ) : null}

      <Modal
        open={Boolean(pendingStarterTargetSelection)}
        title={starterLinkCopy.chooserTitle}
        footer={null}
        onCancel={() => setPendingStarterTargetSelection(null)}
      >
        <Paragraph>{starterLinkCopy.chooserDescription}</Paragraph>
        {pendingStarterTargetSelection ? (
          <Paragraph type="secondary">{pendingStarterTargetSelection.label}</Paragraph>
        ) : null}
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {pendingStarterTargetCandidates.map((candidate) => (
            <Card key={candidate.nodeId} size="small">
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <div>
                  <Text strong>{candidate.label}</Text>
                </div>
                <Space wrap size={[8, 8]}>
                  <Tag>{candidate.nodeType}</Tag>
                  <Tag>{candidate.nodeId}</Tag>
                </Space>
                <Text type="secondary">
                  {starterLinkCopy.chooserCurrentValue}:{' '}
                  {candidate.currentValue ?? starterLinkCopy.chooserUnbound}
                </Text>
                <Button
                  data-testid={`starter-target-${candidate.nodeId}`}
                  onClick={() => applyExplicitStarterTarget(candidate.nodeId)}
                >
                  {starterLinkCopy.chooserSelect}
                </Button>
              </Space>
            </Card>
          ))}
        </Space>
      </Modal>

      {viewMode === 'compose' ? (
        <>
          <div className="section-actions workflow-action-bar">
            {hasPermission('workflow.manage') ? (
              <Button onClick={onImportWorkflowClick}>{t('workflows.importFile')}</Button>
            ) : null}
            {hasPermission('workflow.manage') ? (
              <Button onClick={() => void openAssetWorkflowPicker()}>{t('workflows.importAsset')}</Button>
            ) : null}
            <Button onClick={downloadDraftWorkflow}>{t('workflows.export')}</Button>
            {hasPermission('workflow.manage') ? (
              <Button onClick={() => void onValidate()}>{t('workflows.validate')}</Button>
            ) : null}
            {hasPermission('workflow.manage') ? (
              <Button onClick={() => void onSave()}>{t('workflows.save')}</Button>
            ) : null}
            {hasPermission('workflow.run') ? (
              <Button
                type="primary"
                disabled={runDisabled}
                onClick={() => void onRun()}
              >
                {t('workflows.run')}
              </Button>
            ) : null}
          </div>

          <Row gutter={[20, 20]}>
            <Col xs={24} md={8}>
              <StatCard
                label={t('workflows.nodesLabel')}
                value={String(stats.nodeCount)}
                detail={t('workflows.nodesDetail')}
              />
            </Col>
            <Col xs={24} md={8}>
              <StatCard
                label={t('workflows.edgesLabel')}
                value={String(stats.edgeCount)}
                detail={t('workflows.edgesDetail')}
              />
            </Col>
            <Col xs={24} md={8}>
              <StatCard
                label={t('workflows.categoriesLabel')}
                value={String(stats.categoryCount)}
                detail={t('workflows.categoriesDetail')}
              />
            </Col>
          </Row>

          <WorkflowCanvas
            catalog={localizedWorkflowCatalog}
            templates={localizedWorkflowTemplates}
            workflowVersion={draftWorkflowVersion}
            validationResult={lastValidationResult}
            validationGraphSignature={lastValidationGraphSignature}
            canManage={hasPermission('workflow.manage')}
            canTest={hasPermission('workflow.run')}
            datasets={snapshot.datasets}
            datasetVersions={snapshot.datasetVersions}
            geeCredentials={snapshot.geeCredentials}
            modelVersions={snapshot.modelVersions}
            spatialRois={spatialRois}
            authToken={token}
            onWorkflowChange={setDraftWorkflowVersion}
          />
        </>
      ) : (
        <AssetFlowPanel
          token={token}
          scope={currentUser?.role === 'ADMIN' ? 'all' : 'mine'}
          refreshSignal={assetFlowRefreshSignal}
        />
      )}

      <Modal
        title={t('workflows.assetImportTitle')}
        open={assetImportOpen}
        onCancel={() => setAssetImportOpen(false)}
        onOk={importSelectedAssetWorkflow}
        okText={t('workflows.importAsset')}
        confirmLoading={assetWorkflowsLoading}
      >
        <Paragraph className="workflow-asset-import-copy">{t('workflows.assetImportCopy')}</Paragraph>
        <Table
          rowKey="id"
          loading={assetWorkflowsLoading}
          pagination={ASSET_IMPORT_PAGINATION}
          dataSource={assetWorkflowVersions}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedAssetWorkflowId ? [selectedAssetWorkflowId] : [],
            onChange: (selectedRowKeys) => {
              setSelectedAssetWorkflowId((selectedRowKeys[0] as string | undefined) ?? null);
            },
          }}
          onRow={(record) => ({
            onClick: () => setSelectedAssetWorkflowId(record.id),
          })}
          locale={{ emptyText: t('workflows.assetImportEmpty') }}
          columns={[
            { title: t('workflows.workflowVersion'), dataIndex: 'version' },
            {
              title: t('assets.visibility'),
              dataIndex: 'visibility',
              render: (visibility: string | undefined) => renderVisibilityTag(visibility),
            },
            {
              title: t('assets.owner'),
              dataIndex: 'ownerDisplayName',
              render: (value: string | undefined) => value ?? platformOwnerLabel,
            },
            {
              title: t('common.createdAt'),
              dataIndex: 'createdAt',
            },
          ]}
        />
      </Modal>

      <Modal
        title={runProgressCopy.title}
        open={runProgressOpen}
        footer={null}
        closable={false}
        maskClosable={false}
      >
        <Progress percent={runProgressPercent} status="active" />
        <Paragraph style={{ marginBottom: 0 }}>{runProgressMessage}</Paragraph>
      </Modal>
    </div>
  );
}
