import type { AssetVersionRef } from '@platform/types';

import { Card, Col, Empty, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { StatCard } from '@/components/StatCard';
import { useI18n } from '@/i18n/useI18n';
import { workflowRunStatusKey } from '@/lib/i18n-helpers';
import { AssetNextStepCell } from './AssetNextStepCell';
import { buildAssetVersionRefNextSteps } from './next-steps';
import {
  createHandoffPath,
  createSpatialAssetHandoff,
  createWorkflowDatasetHandoff,
} from './handoff';
import { loadAssetFlowOverview } from './api';

const { Paragraph, Text } = Typography;

function formatDateTime(value: string | undefined, locale: string): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(locale);
}

function assetVersionLabel(assetVersion: AssetVersionRef | undefined): string {
  if (!assetVersion) {
    return '-';
  }

  return `${assetVersion.asset.name} ${assetVersion.versionLabel}`;
}

function statusColor(status: string): string {
  if (status === 'succeeded') {
    return 'green';
  }
  if (status === 'running' || status === 'queued') {
    return 'processing';
  }
  if (status === 'failed') {
    return 'red';
  }
  return 'default';
}

export function AssetFlowPanel({
  token,
  scope,
  refreshSignal,
}: {
  token: string | null;
  scope: 'mine' | 'all';
  refreshSignal: number;
}) {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof loadAssetFlowOverview>> | null>(
    null,
  );

  const copy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            kicker: 'Asset Flow',
            title: '数据集到工作流再到结果资产',
            description: '用统一视图查看输入资产、执行记录和输出结果之间的可追踪关系。',
            executions: '执行记录',
            executionsDetail: '当前范围内的工作流执行次数。',
            outputs: '输出资产',
            outputsDetail: '由执行流产出的数据集版本数量。',
            edges: '血缘连接',
            edgesDetail: '输入资产和输出结果之间的可追踪连接。',
            reusableOutputs: '可继续复用的输出',
            reusableOutputsCopy: '把工作流输出直接送到其他功能页，不再要求先下载再上传。',
            nextSteps: '下一步',
            openInMap: '在地图中打开',
            useInWorkflow: '作为工作流输入',
            executionTable: '执行流',
            workflow: '工作流',
            inputs: '输入资产',
            outputsColumn: '输出结果',
            submittedBy: '提交人',
            finishedAt: '完成时间',
            lineageTable: '最近资产连接',
            source: '来源资产',
            execution: '执行',
            target: '目标输出',
            loading: '正在加载资产流...',
            empty: '当前范围内还没有可展示的资产流记录。',
            unavailable: '加载资产流失败。',
          }
        : {
            kicker: 'Asset Flow',
            title: 'Dataset to Workflow to Result',
            description:
              'Trace how input assets move through workflow executions and become reusable outputs.',
            executions: 'Executions',
            executionsDetail: 'Workflow executions in the current scope.',
            outputs: 'Outputs',
            outputsDetail: 'Dataset versions produced by executions.',
            edges: 'Lineage Edges',
            edgesDetail: 'Traceable connections between inputs and outputs.',
            reusableOutputs: 'Reusable Outputs',
            reusableOutputsCopy:
              'Promote workflow outputs into the next page directly instead of downloading and uploading again.',
            nextSteps: 'Next Steps',
            openInMap: 'Open In Map',
            useInWorkflow: 'Use In Workflow',
            executionTable: 'Execution Stream',
            workflow: 'Workflow',
            inputs: 'Input Assets',
            outputsColumn: 'Output Assets',
            submittedBy: 'Submitted By',
            finishedAt: 'Finished At',
            lineageTable: 'Recent Asset Links',
            source: 'Source Asset',
            execution: 'Execution',
            target: 'Target Output',
            loading: 'Loading asset flow...',
            empty: 'No asset flow records are available for this scope yet.',
            unavailable: 'Failed to load the asset flow overview.',
          },
    [locale],
  );

  const openInMap = useCallback(
    (assetVersionId: string) => {
      navigate(
        createHandoffPath(
          '/spatial',
          createSpatialAssetHandoff(assetVersionId, {
            source: 'asset_flow',
          }),
        ),
      );
    },
    [navigate],
  );

  const openInWorkflow = useCallback(
    (assetVersionId: string) => {
      navigate(
        createHandoffPath(
          '/workflows',
          createWorkflowDatasetHandoff(assetVersionId, {
            source: 'asset_flow',
          }),
        ),
      );
    },
    [navigate],
  );

  useEffect(() => {
    if (!token) {
      setOverview(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void loadAssetFlowOverview(token, scope)
      .then((payload) => {
        if (!cancelled) {
          setOverview(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(copy.unavailable);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [copy.unavailable, refreshSignal, scope, token]);

  const assetVersionMap = useMemo(() => {
    return new Map((overview?.assetVersions ?? []).map((item) => [item.id, item]));
  }, [overview]);

  const producedOutputIds = useMemo(() => {
    const values = new Set<string>();
    for (const execution of overview?.executions ?? []) {
      for (const outputId of execution.outputAssetVersionIds) {
        values.add(outputId);
      }
    }
    return values;
  }, [overview]);

  const reusableOutputRows = useMemo(
    () =>
      (overview?.assetVersions ?? []).filter(
        (item) => item.sourceExecutionId && item.consumableBy.length > 0,
      ),
    [overview],
  );

  const executionRows = overview?.executions ?? [];
  const lineageRows = overview?.lineageEdges ?? [];

  return (
    <Card className="panel-card" variant="borderless">
      <div className="panel-kicker">{copy.kicker}</div>
      <h3 className="section-title">{copy.title}</h3>
      <Paragraph className="section-copy">{copy.description}</Paragraph>

      {loading ? (
        <div className="page-fallback">
          <Space direction="vertical" align="center">
            <Spin />
            <Text>{copy.loading}</Text>
          </Space>
        </div>
      ) : error ? (
        <Empty description={error} />
      ) : !overview || executionRows.length === 0 ? (
        <Empty description={copy.empty} />
      ) : (
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
          <div>
            <div className="panel-kicker">{copy.reusableOutputs}</div>
            <Paragraph className="section-copy">{copy.reusableOutputsCopy}</Paragraph>
            <Table
              rowKey="id"
              pagination={{ pageSize: 5, hideOnSinglePage: true }}
              dataSource={reusableOutputRows}
              columns={[
                {
                  title: copy.outputsColumn,
                  key: 'assetVersion',
                  render: (_value, record: AssetVersionRef) => (
                    <Space direction="vertical" size={2}>
                      <Text strong>{assetVersionLabel(record)}</Text>
                      <Text type="secondary">{record.sourceExecutionId ?? '-'}</Text>
                    </Space>
                  ),
                },
                {
                  title: copy.nextSteps,
                  key: 'actions',
                  render: (_value, record: AssetVersionRef) => (
                    <AssetNextStepCell
                      model={buildAssetVersionRefNextSteps(locale, {
                        assetVersion: record,
                        onOpenInWorkflow: record.consumableBy.includes('workflow_dataset')
                          ? () => openInWorkflow(record.id)
                          : undefined,
                        onOpenInMap:
                          record.consumableBy.includes('map_overlay') || record.spatialTraits?.overlayType
                            ? () => openInMap(record.id)
                            : undefined,
                      })}
                    />
                  ),
                },
              ]}
            />
          </div>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <StatCard
                label={copy.executions}
                value={String(executionRows.length)}
                detail={copy.executionsDetail}
              />
            </Col>
            <Col xs={24} md={8}>
              <StatCard
                label={copy.outputs}
                value={String(producedOutputIds.size)}
                detail={copy.outputsDetail}
              />
            </Col>
            <Col xs={24} md={8}>
              <StatCard
                label={copy.edges}
                value={String(lineageRows.length)}
                detail={copy.edgesDetail}
              />
            </Col>
          </Row>

          <div>
            <div className="panel-kicker">{copy.executionTable}</div>
            <Table
              rowKey="id"
              pagination={{ pageSize: 6, hideOnSinglePage: true }}
              dataSource={executionRows}
              columns={[
                {
                  title: copy.workflow,
                  key: 'workflow',
                  render: (_value, record) => record.workflowName ?? record.workflowVersionId,
                },
                {
                  title: copy.inputs,
                  dataIndex: 'inputAssetVersionIds',
                  render: (value: string[]) =>
                    value.length ? (
                      <Space wrap>
                        {value.map((assetVersionId) => (
                          <Tag key={assetVersionId}>{assetVersionLabel(assetVersionMap.get(assetVersionId))}</Tag>
                        ))}
                      </Space>
                    ) : (
                      '-'
                    ),
                },
                {
                  title: copy.outputsColumn,
                  dataIndex: 'outputAssetVersionIds',
                  render: (value: string[]) =>
                    value.length ? (
                      <Space wrap>
                        {value.map((assetVersionId) => (
                          <Tag key={assetVersionId} color="blue">
                            {assetVersionLabel(assetVersionMap.get(assetVersionId))}
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      '-'
                    ),
                },
                {
                  title: t('common.status'),
                  dataIndex: 'status',
                  render: (status: string) => (
                    <Tag color={statusColor(status)}>{t(workflowRunStatusKey(status as never))}</Tag>
                  ),
                },
                { title: copy.submittedBy, dataIndex: 'submittedBy' },
                {
                  title: copy.finishedAt,
                  dataIndex: 'finishedAt',
                  render: (value: string | undefined) => formatDateTime(value, locale),
                },
              ]}
            />
          </div>

          <div>
            <div className="panel-kicker">{copy.lineageTable}</div>
            <Table
              rowKey="id"
              pagination={{ pageSize: 6, hideOnSinglePage: true }}
              dataSource={lineageRows}
              columns={[
                {
                  title: copy.source,
                  dataIndex: 'sourceAssetVersionId',
                  render: (value: string) => assetVersionLabel(assetVersionMap.get(value)),
                },
                {
                  title: copy.execution,
                  dataIndex: 'executionId',
                  render: (value: string | undefined) =>
                    executionRows.find((item) => item.id === value)?.workflowName ??
                    value ??
                    '-',
                },
                {
                  title: copy.target,
                  dataIndex: 'targetAssetVersionId',
                  render: (value: string) => assetVersionLabel(assetVersionMap.get(value)),
                },
              ]}
            />
          </div>
        </Space>
      )}
    </Card>
  );
}
