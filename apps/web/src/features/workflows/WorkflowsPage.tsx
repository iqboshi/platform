import type { PlatformDataSnapshot } from '@/lib/api';

import { App, Button, Card, Col, Modal, Progress, Row, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { isApiError } from '@/auth/errors';
import { AssetFlowPanel } from '@/features/asset-flow/AssetFlowPanel';
import {
  createHandoffPath,
  createSpatialAssetHandoff,
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
import { workflowRunStatusKey } from '@/lib/i18n-helpers';
import type { WorkflowEditorContext } from './node-registry';
import {
  attachDatasetVersionToWorkflow,
  attachSavedRoiToWorkflow,
} from './draft-handoff';
import { buildWorkflowStats } from './workflow-utils';

const { Paragraph } = Typography;

const RUN_HISTORY_PAGINATION = {
  pageSize: 8,
  showSizeChanger: true,
  pageSizeOptions: ['8', '20', '50'],
  hideOnSinglePage: true,
};

const ASSET_IMPORT_PAGINATION = {
  pageSize: 6,
  showSizeChanger: true,
  pageSizeOptions: ['6', '12', '24'],
  hideOnSinglePage: true,
};

function datasetVersionIsMapReady(
  datasetVersionId: string | undefined,
  snapshot: PlatformDataSnapshot,
): boolean {
  if (!datasetVersionId) {
    return false;
  }

  const version = snapshot.datasetVersions.find((item) => item.id === datasetVersionId);
  if (!version) {
    return false;
  }

  const dataset = snapshot.datasets.find((item) => item.id === version.datasetId);
  if (!dataset || !['raster', 'vector'].includes(dataset.kind)) {
    return false;
  }

  const metadata = version.metadata ?? {};
  const contentType = String(metadata.content_type ?? '').toLowerCase();
  const originalFileName = String(metadata.original_file_name ?? '').toLowerCase();

  if (dataset.kind === 'raster') {
    return (
      contentType.includes('tiff') ||
      contentType.includes('geotiff') ||
      originalFileName.endsWith('.tif') ||
      originalFileName.endsWith('.tiff')
    );
  }

  return (
    contentType.includes('geo+json') ||
    contentType.endsWith('/json') ||
    originalFileName.endsWith('.geojson') ||
    originalFileName.endsWith('.json')
  );
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
  const navigate = useNavigate();
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
    const pendingLinkKey = linkedDatasetVersionId
      ? `dataset:${linkedDatasetVersionId}`
      : linkedRoiId
        ? `roi:${linkedRoiId}`
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
            message.success(runTableCopy.datasetLinked);
          } else {
            message.warning(runTableCopy.datasetLinkMissing);
          }
        }
    } else if (linkedRoiId) {
        const roiExists = spatialRois.some((item) => item.id === linkedRoiId);
        if (!roiExists) {
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
            message.success(runTableCopy.roiLinked);
          } else {
            message.warning(runTableCopy.roiLinkMissing);
          }
        }
    }

    /*
    const linkedDatasetVersionId = searchParams.get('datasetVersionId');
    if (!consumedHandoff && linkedDatasetVersionId) {
      const datasetVersionExists = snapshot.datasetVersions.some(
        (item) => item.id === linkedDatasetVersionId,
      );
      if (!datasetVersionExists) {
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
          message.success(runTableCopy.datasetLinked);
        } else {
          message.warning(runTableCopy.datasetLinkMissing);
        }
      }
      nextSearch.delete('datasetVersionId');
    }

    const linkedRoiId = searchParams.get('roiId');
    if (!consumedHandoff && linkedRoiId) {
      if (!spatialRoisLoaded) {
        return;
      }
      const roiExists = spatialRois.some((item) => item.id === linkedRoiId);
      if (!roiExists) {
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
          message.success(runTableCopy.roiLinked);
        } else {
          message.warning(runTableCopy.roiLinkMissing);
        }
      }
      nextSearch.delete('roiId');
    }

    */
    if (changed) {
      draftWorkflowVersionRef.current = nextWorkflowVersion;
      setDraftWorkflowVersion(nextWorkflowVersion);
    }

    const nextSearch = removeHandoffFromSearchParams(searchParams);
    nextSearch.delete('datasetVersionId');
    nextSearch.delete('roiId');
    setSearchParams(nextSearch, { replace: true });
  }, [
    message,
    runTableCopy,
    searchParams,
    setSearchParams,
    locale,
    snapshot.datasetVersions,
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

  const openResultInMap = useCallback(
    (assetVersionId: string) => {
      navigate(
        createHandoffPath(
          '/spatial',
          createSpatialAssetHandoff(assetVersionId, {
            source: 'workflow_run_history',
          }),
        ),
      );
    },
    [navigate],
  );

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

      <Card className="panel-card" variant="borderless">
        <div className="panel-kicker">{t('workflows.runHistory')}</div>
        <Table
          rowKey="id"
          pagination={RUN_HISTORY_PAGINATION}
          dataSource={snapshot.workflowRuns}
          columns={[
            { title: t('workflows.runId'), dataIndex: 'id' },
            { title: t('workflows.workflowVersion'), dataIndex: 'workflowVersionId' },
            {
              title: t('common.status'),
              dataIndex: 'status',
              render: (status: PlatformDataSnapshot['workflowRuns'][number]['status']) => (
                <Tag color={status === 'running' ? 'processing' : status === 'succeeded' ? 'green' : 'default'}>
                  {t(workflowRunStatusKey(status))}
                </Tag>
              ),
            },
            { title: t('workflows.submittedBy'), dataIndex: 'submittedBy' },
            {
              title: runTableCopy.resultDataset,
              dataIndex: 'resultDatasetVersionId',
              render: (value: string | undefined) =>
                value ? (
                  <Row gutter={[8, 8]}>
                    <Col span={24}>{value}</Col>
                    {datasetVersionIsMapReady(value, snapshot) ? (
                      <Col span={24}>
                        <Button size="small" onClick={() => openResultInMap(value)}>
                          {runTableCopy.openInMap}
                        </Button>
                      </Col>
                    ) : null}
                  </Row>
                ) : (
                  '-'
                ),
            },
            {
              title: runTableCopy.metrics,
              dataIndex: 'metrics',
              render: (metrics: Record<string, unknown> | undefined) =>
                metrics && Object.keys(metrics).length ? (
                  <pre className="json-block">{JSON.stringify(metrics, null, 2)}</pre>
                ) : (
                  '-'
                ),
            },
          ]}
        />
      </Card>

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
