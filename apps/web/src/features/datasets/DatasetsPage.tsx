import type { PlatformDataSnapshot } from '@/lib/api';

import { App, Button, Card, Col, Descriptions, Empty, Row, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import { downloadDatasetVersion, updateDataset } from '@/lib/api';
import { datasetKindKey, datasetStatusKey } from '@/lib/i18n-helpers';

const { Paragraph, Text, Title } = Typography;

const DATASET_LIST_PAGINATION = {
  pageSize: 8,
  showSizeChanger: true,
  pageSizeOptions: ['8', '20', '50'],
  hideOnSinglePage: true,
};

function getMetadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getMetadataNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === 'number' ? value : undefined;
}

function getMetadataStringList(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function getMetadataRecordList(
  metadata: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  );
}

function getSampleRecord(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = metadata.sample_record;
  if (typeof direct === 'object' && direct !== null && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  const rows = getMetadataRecordList(metadata, 'sample_rows');
  return rows[0];
}

function formatFileSize(sizeBytes: number | undefined): string {
  if (sizeBytes === undefined) {
    return '-';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = sizeBytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function DatasetsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const { currentUser, token } = useAuth();
  const { locale, t } = useI18n();
  const platformOwnerLabel = t('assets.platformOwner');
  const publicDatasets = useMemo(
    () => snapshot.datasets.filter((item) => item.visibility === 'public'),
    [snapshot.datasets],
  );
  const publicDatasetVersions = useMemo(
    () => snapshot.datasetVersions.filter((item) => item.visibility === 'public'),
    [snapshot.datasetVersions],
  );
  const latestVersionByDatasetId = useMemo(() => {
    const map = new Map<string, PlatformDataSnapshot['datasetVersions'][number]>();
    publicDatasets.forEach((dataset) => {
      const version =
        publicDatasetVersions.find((item) => item.id === dataset.latestVersionId) ??
        publicDatasetVersions.find((item) => item.datasetId === dataset.id);
      if (version) {
        map.set(dataset.id, version);
      }
    });
    return map;
  }, [publicDatasetVersions, publicDatasets]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | undefined>(
    publicDatasets[0]?.id,
  );

  useEffect(() => {
    setSelectedDatasetId((current) => {
      if (current && publicDatasets.some((item) => item.id === current)) {
        return current;
      }
      return publicDatasets[0]?.id;
    });
  }, [publicDatasets]);

  const selectedDataset = useMemo(
    () => publicDatasets.find((item) => item.id === selectedDatasetId) ?? publicDatasets[0],
    [publicDatasets, selectedDatasetId],
  );
  const selectedVersion = useMemo(
    () => (selectedDataset ? latestVersionByDatasetId.get(selectedDataset.id) : undefined),
    [latestVersionByDatasetId, selectedDataset],
  );
  const selectedMetadata = useMemo(
    () => selectedVersion?.metadata ?? {},
    [selectedVersion],
  );
  const selectedColumns = useMemo(
    () => getMetadataStringList(selectedMetadata, 'columns'),
    [selectedMetadata],
  );
  const selectedSampleRow = useMemo(
    () => getSampleRecord(selectedMetadata),
    [selectedMetadata],
  );
  const selectedDescription =
    selectedDataset?.description?.trim() || t('datasets.descriptionFallback');
  const selectedStatus = selectedVersion?.status ?? selectedDataset?.status;
  const selectedUpdatedAt = selectedDataset?.updatedAt
    ? new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(selectedDataset.updatedAt))
    : '-';

  const onDownloadVersion = async (datasetVersionId: string | undefined) => {
    if (!token || !datasetVersionId) {
      return;
    }

    try {
      await downloadDatasetVersion(token, datasetVersionId);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const onUnpublishSelectedDataset = async () => {
    if (!token || !selectedDataset || currentUser?.role !== 'ADMIN') {
      return;
    }

    try {
      await updateDataset(token, selectedDataset.id, { visibility: 'private' });
      message.success(t('datasets.unpublished'));
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
            <div className="panel-kicker">{t('datasets.kicker')}</div>
            <h2 className="section-title">{t('datasets.title')}</h2>
            <Paragraph className="section-copy">{t('datasets.copy')}</Paragraph>
          </div>
        </div>
      </div>

      {publicDatasets.length === 0 ? (
        <Card className="panel-card" variant="borderless">
          <Empty description={t('datasets.emptyPublic')} />
        </Card>
      ) : (
        <Row gutter={[20, 20]}>
          <Col xs={24} xl={10}>
            <Card className="panel-card" variant="borderless">
              <Table
                rowKey="id"
                dataSource={publicDatasets}
                pagination={DATASET_LIST_PAGINATION}
                className="public-dataset-table"
                rowClassName={(record) =>
                  record.id === selectedDataset?.id
                    ? 'public-dataset-row public-dataset-row-selected'
                    : 'public-dataset-row'
                }
                onRow={(record) => ({
                  onClick: () => setSelectedDatasetId(record.id),
                })}
                columns={[
                  { title: t('datasets.table.dataset'), dataIndex: 'name' },
                  {
                    title: t('datasets.table.kind'),
                    dataIndex: 'kind',
                    render: (kind: PlatformDataSnapshot['datasets'][number]['kind']) =>
                      t(datasetKindKey(kind)),
                  },
                  {
                    title: t('datasets.owner'),
                    dataIndex: 'ownerDisplayName',
                    render: (value: string | undefined) => value ?? platformOwnerLabel,
                  },
                  {
                    title: t('datasets.table.status'),
                    key: 'status',
                    render: (_: unknown, record: PlatformDataSnapshot['datasets'][number]) => (
                      <Tag color={record.status === 'ready' ? 'green' : 'processing'}>
                        {t(datasetStatusKey(record.status))}
                      </Tag>
                    ),
                  },
                  {
                    title: t('common.actions'),
                    key: 'view',
                    render: (_: unknown, record: PlatformDataSnapshot['datasets'][number]) => (
                      <Button
                        size="small"
                        type={record.id === selectedDataset?.id ? 'primary' : 'default'}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedDatasetId(record.id);
                        }}
                      >
                        {t('datasets.viewDetails')}
                      </Button>
                    ),
                  },
                ]}
              />
            </Card>
          </Col>

          <Col xs={24} xl={14}>
            <Card className="panel-card public-dataset-detail-card" variant="borderless">
              <div className="public-dataset-detail-head">
                <div className="public-dataset-detail-copy">
                  <div className="panel-kicker">{t('datasets.selectedVersion')}</div>
                  <Title level={3} className="public-dataset-title">
                    {selectedDataset?.name ?? '-'}
                  </Title>
                  <Paragraph className="public-dataset-description">
                    {selectedDescription}
                  </Paragraph>
                </div>
                <Space wrap>
                  <Button
                    type="primary"
                    disabled={!selectedVersion}
                    onClick={() => void onDownloadVersion(selectedVersion?.id)}
                  >
                    {t('datasets.downloadAsset')}
                  </Button>
                  {currentUser?.role === 'ADMIN' && selectedDataset ? (
                    <Button onClick={() => void onUnpublishSelectedDataset()}>
                      {t('datasets.unpublish')}
                    </Button>
                  ) : null}
                </Space>
              </div>

              <Descriptions column={2}>
                <Descriptions.Item label={t('datasets.version')}>
                  {selectedVersion?.version ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('common.status')}>
                  <Tag color={selectedStatus === 'ready' ? 'green' : 'processing'}>
                    {selectedStatus ? t(datasetStatusKey(selectedStatus)) : '-'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.owner')}>
                  {selectedDataset?.ownerDisplayName ?? platformOwnerLabel}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.visibility')}>
                  <Tag color="blue">{t('datasets.visibilityPublic')}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.table.kind')}>
                  {selectedDataset ? t(datasetKindKey(selectedDataset.kind)) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.updatedAt')}>
                  {selectedUpdatedAt}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.originalFileName')}>
                  {getMetadataString(selectedMetadata, 'original_file_name') ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.contentType')}>
                  {getMetadataString(selectedMetadata, 'content_type') ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.fileSize')}>
                  {formatFileSize(getMetadataNumber(selectedMetadata, 'size_bytes'))}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.rowCount')}>
                  {getMetadataNumber(selectedMetadata, 'row_count') ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.columnCount')}>
                  {selectedColumns.length || '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.assetPath')}>
                  {selectedVersion?.assetPath ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.description')} span={2}>
                  <Paragraph className="public-dataset-description-block">
                    {selectedDescription}
                  </Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.fields')} span={2}>
                  {selectedColumns.length ? (
                    <div className="public-dataset-field-tags">
                      {selectedColumns.map((column) => (
                        <Tag key={column}>{column}</Tag>
                      ))}
                    </div>
                  ) : (
                    <Text>-</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.sampleRecord')} span={2}>
                  {selectedSampleRow ? (
                    <pre className="json-block">{JSON.stringify(selectedSampleRow, null, 2)}</pre>
                  ) : (
                    <Text>-</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label={t('datasets.metadata')} span={2}>
                  <pre className="json-block">{JSON.stringify(selectedMetadata, null, 2)}</pre>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
