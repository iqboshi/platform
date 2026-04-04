import type { PlatformDataSnapshot } from '@/lib/api';

import { App, Button, Card, Col, Modal, Row, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { StatCard } from '@/components/StatCard';
import { WorkflowCanvas } from '@/components/WorkflowCanvas';
import { useI18n } from '@/i18n/useI18n';
import {
  createWorkflowRun,
  importWorkflowVersion,
  listWorkflowVersions,
  saveWorkflowVersion,
  validateWorkflow,
} from '@/lib/api';
import { parseImportedWorkflowGraph } from '@/lib/workflow-import';
import { workflowRunStatusKey } from '@/lib/i18n-helpers';
import { buildWorkflowStats } from './workflow-utils';

const { Paragraph } = Typography;

export function WorkflowsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message, modal } = App.useApp();
  const { hasPermission, token } = useAuth();
  const { locale, t } = useI18n();
  const [draftWorkflowVersion, setDraftWorkflowVersion] = useState(snapshot.workflowVersion);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [assetImportOpen, setAssetImportOpen] = useState(false);
  const [assetWorkflowsLoading, setAssetWorkflowsLoading] = useState(false);
  const [assetWorkflowVersions, setAssetWorkflowVersions] = useState<
    Awaited<ReturnType<typeof listWorkflowVersions>>
  >([]);
  const [selectedAssetWorkflowId, setSelectedAssetWorkflowId] = useState<string | null>(null);
  const stats = useMemo(
    () => buildWorkflowStats(snapshot.workflowCatalog, draftWorkflowVersion),
    [draftWorkflowVersion, snapshot.workflowCatalog],
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
          }
        : {
            resultDataset: 'Result Dataset',
            metrics: 'Metrics',
          },
    [locale],
  );

  useEffect(() => {
    setDraftWorkflowVersion(snapshot.workflowVersion);
  }, [snapshot.workflowVersion]);

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
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const onRun = async () => {
    if (!token) {
      return;
    }
    try {
      let workflowVersionToRun = draftWorkflowVersion;

      if (hasPermission('workflow.manage') && hasUnsavedChanges) {
        workflowVersionToRun = await saveWorkflowVersion(token, draftWorkflowVersion);
        setDraftWorkflowVersion(workflowVersionToRun);
      }

      await createWorkflowRun(token, workflowVersionToRun, snapshot.workspace.id);
      message.success(t('workflows.runCompleted'));
      await onRefresh();
    } catch (error) {
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
      const workflows = await listWorkflowVersions(token, 'mine');
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
        modelVersions={snapshot.modelVersions}
        authToken={token}
        onWorkflowChange={setDraftWorkflowVersion}
      />

      <Card className="panel-card" variant="borderless">
        <div className="panel-kicker">{t('workflows.runHistory')}</div>
        <Table
          rowKey="id"
          pagination={false}
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
              render: (value: string | undefined) => value ?? '-',
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
          pagination={false}
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
              title: t('assets.owner'),
              dataIndex: 'ownerDisplayName',
              render: (value: string | undefined) => value ?? '-',
            },
            {
              title: t('common.createdAt'),
              dataIndex: 'createdAt',
            },
          ]}
        />
      </Modal>
    </div>
  );
}
