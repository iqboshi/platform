import type { PlatformDataSnapshot } from '@/lib/api';

import { App, Button, Card, Col, Row, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { StatCard } from '@/components/StatCard';
import { WorkflowCanvas } from '@/components/WorkflowCanvas';
import { useI18n } from '@/i18n/useI18n';
import { createWorkflowRun, saveWorkflowVersion, validateWorkflow } from '@/lib/api';
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
  const { message } = App.useApp();
  const { hasPermission, token } = useAuth();
  const { t } = useI18n();
  const [draftWorkflowVersion, setDraftWorkflowVersion] = useState(snapshot.workflowVersion);
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] = useState<string | undefined>(
    snapshot.datasetVersions[0]?.id,
  );
  const [selectedModelVersionId, setSelectedModelVersionId] = useState<string | undefined>(
    snapshot.modelVersions[0]?.id,
  );
  const stats = useMemo(
    () => buildWorkflowStats(snapshot.workflowCatalog, draftWorkflowVersion),
    [draftWorkflowVersion, snapshot.workflowCatalog],
  );

  useEffect(() => {
    setDraftWorkflowVersion(snapshot.workflowVersion);
  }, [snapshot.workflowVersion]);

  useEffect(() => {
    setSelectedDatasetVersionId(snapshot.datasetVersions[0]?.id);
  }, [snapshot.datasetVersions]);

  useEffect(() => {
    setSelectedModelVersionId(snapshot.modelVersions[0]?.id);
  }, [snapshot.modelVersions]);

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
    if (!token || !selectedDatasetVersionId || !selectedModelVersionId) {
      return;
    }
    try {
      await createWorkflowRun(
        token,
        draftWorkflowVersion,
        selectedDatasetVersionId,
        selectedModelVersionId,
        snapshot.workspace.id,
      );
      message.success(t('workflows.runCompleted'));
      await onRefresh();
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="section-header-actions">
          <div>
            <div className="panel-kicker">{t('workflows.kicker')}</div>
            <h2 className="section-title">{t('workflows.title')}</h2>
            <Paragraph className="section-copy">{t('workflows.copy')}</Paragraph>
          </div>
          <div className="section-actions">
            {hasPermission('workflow.manage') ? (
              <Button onClick={() => void onValidate()}>{t('workflows.validate')}</Button>
            ) : null}
            {hasPermission('workflow.manage') ? (
              <Button onClick={() => void onSave()}>{t('common.submit')}</Button>
            ) : null}
            {hasPermission('workflow.run') ? (
              <Button
                type="primary"
                disabled={!selectedDatasetVersionId || !selectedModelVersionId}
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

      <Card className="panel-card" variant="borderless">
        <Space wrap size="large">
          <div>
            <div className="panel-kicker">{t('menu.datasets')}</div>
            <Select
              value={selectedDatasetVersionId}
              onChange={setSelectedDatasetVersionId}
              options={snapshot.datasetVersions.map((item) => ({
                value: item.id,
                label: `${item.id} / v${item.version}`,
              }))}
              style={{ minWidth: 260 }}
            />
          </div>
          <div>
            <div className="panel-kicker">{t('menu.models')}</div>
            <Select
              value={selectedModelVersionId}
              onChange={setSelectedModelVersionId}
              options={snapshot.modelVersions.map((item) => ({
                value: item.id,
                label: `${item.version} / ${item.framework}`,
              }))}
              style={{ minWidth: 220 }}
            />
          </div>
        </Space>
      </Card>

      <WorkflowCanvas
        catalog={snapshot.workflowCatalog}
        workflowVersion={draftWorkflowVersion}
        canManage={hasPermission('workflow.manage')}
        datasets={snapshot.datasets}
        datasetVersions={snapshot.datasetVersions}
        modelVersions={snapshot.modelVersions}
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
          ]}
        />
      </Card>
    </div>
  );
}
