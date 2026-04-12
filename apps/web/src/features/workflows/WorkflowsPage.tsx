import type { PlatformDataSnapshot } from '@/lib/api';

import { Alert, App, Button, Col, Modal, Progress, Row, Table, Tag, Typography } from 'antd';
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
import { buildWorkflowStats } from './workflow-utils';

const { Paragraph } = Typography;

const ASSET_IMPORT_PAGINATION = {
  pageSize: 6,
  showSizeChanger: true,
  pageSizeOptions: ['6', '12', '24'],
  hideOnSinglePage: true,
};

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
  const runProgressTimerRef = useRef<number | null>(null);
  const [assetFlowRefreshSignal, setAssetFlowRefreshSignal] = useState(0);
  const [handoffNotice, setHandoffNotice] = useState<{
    type: 'success' | 'warning';
    title: string;
    description: string;
  } | null>(null);
  const stats = useMemo(
    () => buildWorkflowStats(snapshot.workflowCatalog, draftWorkflowVersion),
    [draftWorkflowVersion, snapshot.workflowCatalog],
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
  const hasSentinelDownload = useMemo(
    () =>
      draftWorkflowVersion.graph.nodes.some((node) => node.type === 'source.sentinel2_gee_download'),
    [draftWorkflowVersion.graph.nodes],
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
          snapshot.workflowCatalog,
          workflowEditorContext,
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
          setHandoffNotice({
            type: 'warning',
            title:
              locale === 'zh-CN'
                ? `未能接收数据输入：${handoff?.label ?? linkedDatasetVersionId}`
                : `Unable to receive dataset input: ${handoff?.label ?? linkedDatasetVersionId}`,
            description: runTableCopy.datasetLinkMissing,
          });
          message.warning(runTableCopy.datasetLinkMissing);
        }
      }
    } else if (linkedModelVersionId) {
      const modelVersionExists = snapshot.modelVersions.some((item) => item.id === linkedModelVersionId);
      if (!modelVersionExists) {
        setHandoffNotice({
          type: 'warning',
          title: `Unable to receive model input: ${handoff?.label ?? linkedModelVersionId}`,
          description: 'This model version is no longer available in the current scope.',
        });
        message.warning('This model version is no longer available in the current scope.');
      } else {
        const linkedModelResult = attachModelVersionToWorkflow(
          nextWorkflowVersion,
          linkedModelVersionId,
          snapshot.workflowCatalog,
          workflowEditorContext,
        );
        if (linkedModelResult.applied) {
          nextWorkflowVersion = linkedModelResult.workflowVersion;
          changed = true;
          setHandoffNotice({
            type: 'success',
            title: `Model input received: ${handoff?.label ?? linkedModelVersionId}`,
            description: linkedModelResult.createdStarter
              ? 'A model starter node was added automatically and bound to this version.'
              : 'This model version has been bound to an existing compatible node in the current draft.',
          });
          message.success('The model version has been attached to the current workflow draft.');
        } else {
          setHandoffNotice({
            type: 'warning',
            title: `Unable to receive model input: ${handoff?.label ?? linkedModelVersionId}`,
            description: 'The current workflow does not expose any compatible model starter.',
          });
          message.warning('The current workflow does not expose any compatible model starter.');
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
          snapshot.workflowCatalog,
          workflowEditorContext,
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
          setHandoffNotice({
            type: 'warning',
            title:
              locale === 'zh-CN'
                ? `未能接收 ROI：${handoff?.label ?? linkedRoiId}`
                : `Unable to receive ROI: ${handoff?.label ?? linkedRoiId}`,
            description: runTableCopy.roiLinkMissing,
          });
          message.warning(runTableCopy.roiLinkMissing);
        }
      }
    } else if (linkedGeeCredentialId) {
      const credentialExists = snapshot.geeCredentials.some((item) => item.id === linkedGeeCredentialId);
      if (!credentialExists) {
        setHandoffNotice({
          type: 'warning',
          title: `Unable to receive GEE credential: ${handoff?.label ?? linkedGeeCredentialId}`,
          description: 'This GEE credential is no longer available in the current scope.',
        });
        message.warning('This GEE credential is no longer available in the current scope.');
      } else {
        const linkedCredentialResult = attachGeeCredentialToWorkflow(
          nextWorkflowVersion,
          linkedGeeCredentialId,
          snapshot.workflowCatalog,
          workflowEditorContext,
        );
        if (linkedCredentialResult.applied) {
          nextWorkflowVersion = linkedCredentialResult.workflowVersion;
          changed = true;
          setHandoffNotice({
            type: 'success',
            title: `GEE credential received: ${handoff?.label ?? linkedGeeCredentialId}`,
            description: linkedCredentialResult.createdStarter
              ? 'A compatible Sentinel starter node was added automatically and bound to this credential.'
              : 'This credential has been bound to an existing compatible node in the current draft.',
          });
          message.success('The GEE credential has been attached to the current workflow draft.');
        } else {
          setHandoffNotice({
            type: 'warning',
            title: `Unable to receive GEE credential: ${handoff?.label ?? linkedGeeCredentialId}`,
            description: 'The current workflow does not expose any compatible GEE starter.',
          });
          message.warning('The current workflow does not expose any compatible GEE starter.');
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
    message,
    runTableCopy,
    searchParams,
    setSearchParams,
    snapshot.datasetVersions,
    snapshot.geeCredentials,
    snapshot.modelVersions,
    snapshot.workflowCatalog,
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
      const result = await validateWorkflow(token, draftWorkflowVersion);
      if (result.valid) {
        message.success(t('workflows.validateSuccess'));
      } else {
        message.warning(`${t('workflows.validateFailure')} ${result.errors.join('; ')}`);
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
          <div className="section-actions">
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
                disabled={!draftWorkflowVersion.graph.nodes.length}
                onClick={() => void onRun()}
              >
                {t('workflows.run')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

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
        catalog={snapshot.workflowCatalog}
        templates={snapshot.workflowTemplates}
        workflowVersion={draftWorkflowVersion}
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

      <AssetFlowPanel
        token={token}
        scope={currentUser?.role === 'ADMIN' ? 'all' : 'mine'}
        refreshSignal={assetFlowRefreshSignal}
      />

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
